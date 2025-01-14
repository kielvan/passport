// ----- Types
import { Provider, ProviderOptions } from "../../types";
import { RequestPayload, VerifiedPayload } from "@gitcoin/passport-types";

// ----- Idena SignIn library
import { IdenaContext, requestIdentityState } from "../procedures/idenaSignIn";

// Class used as a base for verifying Idena state
abstract class IdenaStateProvider implements Provider {
  state: string;

  // The type will be determined dynamically, from the state parameter passed in to the constructor
  type = "";

  // Options can be set here and/or via the constructor
  _options = {};

  // construct the provider instance with supplied options and minAge
  constructor(options: ProviderOptions = {}, state: string) {
    this._options = { ...this._options, ...options };
    this.type = `IdenaState#${state}`;
    this.state = state;
  }

  // verify that the proof object contains valid === "true"
  async verify(payload: RequestPayload, context: IdenaContext): Promise<VerifiedPayload> {
    const token = payload.proofs.sessionKey;
    const { valid, address, expiresInSeconds, errors } = await checkState(token, context, this.state);
    return {
      valid,
      record: {
        address,
        state: this.state,
      },
      errors,
      expiresInSeconds,
    };
  }
}

// Export an Idena provider that verifies that an identity state is Newbie
export class IdenaStateNewbieProvider extends IdenaStateProvider {
  constructor(options: ProviderOptions = {}) {
    super(options, "Newbie");
  }
}

// Export an Idena provider that verifies that an identity state is Verified
export class IdenaStateVerifiedProvider extends IdenaStateProvider {
  constructor(options: ProviderOptions = {}) {
    super(options, "Verified");
  }
}

// Export an Idena provider that verifies that an identity state is Human
export class IdenaStateHumanProvider extends IdenaStateProvider {
  constructor(options: ProviderOptions = {}) {
    super(options, "Human");
  }
}

const checkState = async (
  token: string,
  context: IdenaContext,
  expectedState: string
): Promise<{ valid: boolean; address?: string; expiresInSeconds?: number; errors?: string[] }> => {
  const result = await requestIdentityState(token, context);
  const expiresInSeconds = Math.max((new Date(result.expirationDate).getTime() - new Date().getTime()) / 1000, 0);
  if (result.state === expectedState) {
    return { valid: true, address: result.address, expiresInSeconds };
  }
  return { valid: false, errors: [`State "${result.state}" does not match required state "${expectedState}"`] };
};
