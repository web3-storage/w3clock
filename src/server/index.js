import { Verifier } from '@ucanto/principal'
import * as Server from '@ucanto/server'
import * as CAR from '@ucanto/transport/car'
import * as CBOR from '@ucanto/transport/cbor'
import { access, Schema, Failure } from '@ucanto/validator'

/**
 * @template T
 * @param {Server.Verifier} signer
 * @param {import('../service').Service<T>} service
 */
export function createServer (signer, service) {
  return Server.create({
    id: signer,
    encoder: CBOR,
    decoder: CAR,
    service,
    catch: err => console.error(err),
    // @ts-expect-error
    authorities: [Verifier.parse('did:key:z6MkqdncRZ1wj8zxCTDUQ8CRT8NQWd63T7mZRvZUX8B7XDFi').withDID('did:web:web3.storage')]
  })
}

/**
 * Function that can be used to define given capability provider. It decorates
 * passed handler and takes care of UCAN validation and only calls the handler
 * when validation succeeds.
 *
 *
 * @template {import('@ucanto/interface').Ability} A
 * @template {import('@ucanto/interface').URI} R
 * @template {import('@ucanto/interface').Caveats} C
 * @template {unknown} U
 * @param {import('@ucanto/interface').CapabilityParser<import('@ucanto/interface').Match<import('@ucanto/interface').ParsedCapability<A, R, C>>>} capability
 * @param {(input:Server.ProviderInput<import('@ucanto/interface').ParsedCapability<A, R, C>>) => import('@ucanto/interface').Await<U>} handler
 * @returns {import('@ucanto/interface').ServiceMethod<import('@ucanto/interface').Capability<A, R, C>, Exclude<U, {error:true}>, Exclude<U, Exclude<U, {error:true}>>>}
 */
export const provide = (capability, handler) =>
  /**
   * @param {import('@ucanto/interface').Invocation<import('@ucanto/interface').Capability<A, R, C>>} invocation
   * @param {import('@ucanto/interface').InvocationContext & { authorities?: import('@ucanto/interface').Verifier[] }} options
   */
  async (invocation, options) => {
    const audienceSchema = Schema.literal(options.id.did())
    const result = audienceSchema.read(invocation.audience.did())
    if (result.error) {
      return new InvalidAudience({ cause: result })
    }

    for (const authority of options.authorities ?? []) {
      const authorization = await access(invocation, { ...options, authority, capability })
      if (authorization.error) continue
      return /** @type {import('@ucanto/interface').Result<Exclude<U, {error:true}>, {error:true} & Exclude<U, Exclude<U, {error:true}>>|import('@ucanto/interface').InvocationError>} */ (
        handler({
          capability: authorization.capability,
          invocation,
          context: options
        })
      )
    }

    const authorization = await access(invocation, {
      ...options,
      authority: options.id,
      capability
    })
    if (authorization.error) {
      return authorization
    } else {
      return /** @type {import('@ucanto/interface').Result<Exclude<U, {error:true}>, {error:true} & Exclude<U, Exclude<U, {error:true}>>|import('@ucanto/interface').InvocationError>} */ (
        handler({
          capability: authorization.capability,
          invocation,
          context: options
        })
      )
    }
  }

class InvalidAudience extends Failure {
  /**
   * @param {object} source
   * @param {import('@ucanto/interface').Failure} source.cause
   */
  constructor ({ cause }) {
    super()
    /** @type {'InvalidAudience'} */
    this.name = 'InvalidAudience'
    this.cause = cause
  }

  describe () {
    return this.cause.message
  }

  toJSON () {
    const { error, name, message, stack } = this
    return { error, name, message, stack }
  }
}
