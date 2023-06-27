import { describe, it } from 'mocha'
import assert from 'assert'
import { Signer } from '@ucanto/principal/ed25519'
import { DurableClock, follow, following, unfollow } from '../../src/worker/durable-clock.js'
import { MockState, MockStorage, MockNamespace } from '../helpers/durable-objects.js'

describe('DurableClock', () => {
  it('follows', async () => {
    const sundial = await Signer.generate()
    const alice = await Signer.generate()

    const namespace = new MockNamespace()
    const id = namespace.idFromName(sundial.did())
    const storage = new MockStorage()
    const state = new MockState(id, storage)
    const obj = new DurableClock(state, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(id, obj)

    await follow(namespace, sundial.did(), sundial.did(), alice.did())

    const followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 1)
    const emitters = followings.get(sundial.did())
    assert(emitters)
    assert.equal(emitters.size, 1)
    assert(emitters.has(alice.did()))
  })

  it('follows a different clock', async () => {
    const sundial = await Signer.generate()
    const hourglass = await Signer.generate()
    const alice = await Signer.generate()

    const namespace = new MockNamespace()
    const clockID = namespace.idFromName(sundial.did())
    const clockStorage = new MockStorage()
    const clockState = new MockState(clockID, clockStorage)
    const clockObj = new DurableClock(clockState, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(clockID, clockObj)

    // need a target DO for subscribing
    const targetID = namespace.idFromName(hourglass.did())
    const targetStorage = new MockStorage()
    const targetState = new MockState(targetID, targetStorage)
    const targetObj = new DurableClock(targetState, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(targetID, targetObj)

    await follow(namespace, sundial.did(), hourglass.did(), alice.did())

    const followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 1)
    const emitters = followings.get(hourglass.did())
    assert(emitters)
    assert.equal(emitters.size, 1)
    assert(emitters.has(alice.did()))
  })

  it('unfollows', async () => {
    const sundial = await Signer.generate()
    const alice = await Signer.generate()

    const namespace = new MockNamespace()
    const id = namespace.idFromName(sundial.did())
    const storage = new MockStorage()
    const state = new MockState(id, storage)
    const obj = new DurableClock(state, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(id, obj)

    await follow(namespace, sundial.did(), sundial.did(), alice.did())

    let followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 1)
    let emitters = followings.get(sundial.did())
    assert(emitters)
    assert.equal(emitters.size, 1)
    assert(emitters.has(alice.did()))

    await unfollow(namespace, sundial.did(), sundial.did(), alice.did())

    followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 0)
    emitters = followings.get(sundial.did())
    assert(!emitters)
  })

  it('unfollows a different clock', async () => {
    const sundial = await Signer.generate()
    const hourglass = await Signer.generate()
    const alice = await Signer.generate()

    const namespace = new MockNamespace()
    const clockID = namespace.idFromName(sundial.did())
    const clockStorage = new MockStorage()
    const clockState = new MockState(clockID, clockStorage)
    const clockObj = new DurableClock(clockState, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(clockID, clockObj)

    // need a target DO for subscribing
    const targetID = namespace.idFromName(hourglass.did())
    const targetStorage = new MockStorage()
    const targetState = new MockState(targetID, targetStorage)
    const targetObj = new DurableClock(targetState, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(targetID, targetObj)

    await follow(namespace, sundial.did(), hourglass.did(), alice.did())

    let followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 1)
    let emitters = followings.get(hourglass.did())
    assert(emitters)
    assert.equal(emitters.size, 1)
    assert(emitters.has(alice.did()))

    await unfollow(namespace, sundial.did(), hourglass.did(), alice.did())

    followings = await following(namespace, sundial.did())
    assert.equal(followings.size, 0)
    emitters = followings.get(sundial.did())
    assert(!emitters)
  })
  it('throws error when stub.fetch fails', async () => {
    const sundial = await Signer.generate()
    const alice = await Signer.generate()

    const namespace = new MockNamespace()
    const id = namespace.idFromName(sundial.did())
    const storage = new MockStorage()
    const state = new MockState(id, storage)
    const obj = new DurableClock(state, { DEBUG: 'true', PRIVATE_KEY: 'secret', CLOCK: namespace })
    namespace.set(id, obj)

    // Use our stub function to replace obj.fetch with a function that throws an error
    const restoreFetch = stub(obj, 'fetch', () => { throw new Error('Fetch failed') })

    let error = null
    try {
      await follow(namespace, sundial.did(), sundial.did(), alice.did())
    } catch (e) {
      error = e
    }

    restoreFetch() // restore the original fetch method

    assert(error, 'Expected an error to be thrown')
    assert.equal(error.message, 'Fetch failed')
  })
})

function stub (obj, method, fn) {
  const original = obj[method]
  obj[method] = fn
  return () => { obj[method] = original } // return a restore function
}
