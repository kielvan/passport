// --- Methods
import React, { useContext, useEffect, useMemo, useState } from "react";

// --- Datadog
import { datadogLogs } from "@datadog/browser-logs";

import { debounce } from "ts-debounce";
import { BroadcastChannel } from "broadcast-channel";

// --- Identity tools
import {
  Stamp,
  VerifiableCredential,
  CredentialResponseBody,
  VerifiableCredentialRecord,
} from "@gitcoin/passport-types";
import { fetchVerifiableCredential } from "@gitcoin/passport-identity/dist/commonjs/src/credentials";

// --- Style Components
import { SideBarContent } from "./SideBarContent";
import { DoneToastContent } from "./DoneToastContent";
import { useToast } from "@chakra-ui/react";

// --- Context
import { CeramicContext } from "../context/ceramicContext";
import { UserContext } from "../context/userContext";

// --- Types
import { PlatformGroupSpec } from "@gitcoin/passport-platforms/dist/commonjs/src/types";
import { getPlatformSpec, PROVIDER_ID } from "@gitcoin/passport-platforms/dist/commonjs/src/platforms-config";

// --- Helpers
import { difference } from "../utils/helpers";

type PlatformProps = {
  platformId: string;
  platFormGroupSpec: PlatformGroupSpec[];
};

const iamUrl = process.env.NEXT_PUBLIC_PASSPORT_IAM_URL || "";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

export const GenericEVMPlatform = ({ platformId, platFormGroupSpec }: PlatformProps): JSX.Element => {
  const { address, signer } = useContext(UserContext);
  const { handleAddStamps, handleDeleteStamps, allProvidersState } = useContext(CeramicContext);
  const [isLoading, setLoading] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [verificationAttempted, setVerificationAttempted] = useState(false);

  // --- Chakra functions
  const toast = useToast();

  // find all providerIds
  // find all providerIds
  const providerIds = useMemo(
    () =>
      platFormGroupSpec?.reduce((all, stamp) => {
        return all.concat(stamp.providers?.map((provider) => provider.name as PROVIDER_ID));
      }, [] as PROVIDER_ID[]) || [],
    []
  );

  // SelectedProviders will be passed in to the sidebar to be filled there...
  const [verifiedProviders, setVerifiedProviders] = useState<PROVIDER_ID[]>(
    providerIds.filter((providerId) => typeof allProvidersState[providerId]?.stamp?.credential !== "undefined")
  );
  // SelectedProviders will be passed in to the sidebar to be filled there...
  const [selectedProviders, setSelectedProviders] = useState<PROVIDER_ID[]>([...verifiedProviders]);

  // Create Set to check initial verified providers
  const initialVerifiedProviders = new Set(verifiedProviders);

  // any time we change selection state...
  useEffect(() => {
    if (selectedProviders.length !== verifiedProviders.length) {
      setCanSubmit(true);
    }
  }, [selectedProviders, verifiedProviders]);

  // fetch VCs from IAM server
  const handleFetchCredential = async (): Promise<void> => {
    datadogLogs.logger.info("Saving Stamp", { platform: platformId });
    setLoading(true);
    setVerificationAttempted(true);
    try {
      const verified: VerifiableCredentialRecord = await fetchVerifiableCredential(
        iamUrl,
        {
          type: platformId,
          types: selectedProviders,
          version: "0.0.0",
          address: address || "",
          proofs: {},
          rpcUrl,
        },
        signer as { signMessage: (message: string) => Promise<string> }
      );
      // because we provided a types array in the params we expect to receive a
      // credentials array in the response...
      const vcs =
        verified.credentials
          ?.map((cred: CredentialResponseBody): Stamp | undefined => {
            if (!cred.error) {
              // add each of the requested/received stamps to the passport...
              return {
                provider: cred.record?.type as PROVIDER_ID,
                credential: cred.credential as VerifiableCredential,
              };
            }
          })
          .filter((v: Stamp | undefined) => v) || [];

      // Update the selected stamps for removal
      await handleDeleteStamps(selectedProviders as PROVIDER_ID[]);
      // Add all the stamps to the passport at once
      await handleAddStamps(vcs as Stamp[]);
      datadogLogs.logger.info("Successfully saved Stamp", { platform: platformId });
      // grab all providers who are verified from the verify response
      const actualVerifiedProviders = providerIds.filter(
        (providerId) =>
          !!vcs.find((vc: Stamp | undefined) => vc?.credential?.credentialSubject?.provider === providerId)
      );
      // both verified and selected should look the same after save
      setVerifiedProviders([...actualVerifiedProviders]);
      setSelectedProviders([...actualVerifiedProviders]);

      // Create Set to check changed providers after verification
      const updatedVerifiedProviders = new Set(actualVerifiedProviders);

      // Initial providers set minus updated providers set to determine which data points were removed
      const initialMinusUpdated = difference(initialVerifiedProviders, updatedVerifiedProviders);
      // Updated providers set minus initial providers set to determine which data points were added
      const updatedMinusInitial = difference(updatedVerifiedProviders, initialVerifiedProviders);
      // reset can submit state
      setCanSubmit(false);
      // Custom Success Toast
      if (updatedMinusInitial.size === providerIds.length) {
        completeVerificationToast();
      } else if (initialMinusUpdated.size > 0 && updatedMinusInitial.size === 0) {
        removedDataPointsToast();
      } else {
        failedVerificationToast();
      }
      setLoading(false);
    } catch (e) {
      datadogLogs.logger.error("Verification Error", { error: e, platform: platformId });
      throw e;
    } finally {
      setLoading(false);
    }
  };

  // --- Done Toast Helpers
  const removedDataPointsToast = () => {
    toast({
      duration: 5000,
      isClosable: true,
      render: (result: any) => (
        <DoneToastContent
          title="Success!"
          body={`All ${platformId} data points removed.`}
          icon="../../assets/check-icon.svg"
          platformId={platformId}
          result={result}
        />
      ),
    });
  };

  const completeVerificationToast = () => {
    toast({
      duration: 5000,
      isClosable: true,
      render: (result: any) => (
        <DoneToastContent
          title="Success!"
          body={`All ${platformId} data points verified.`}
          icon="../../assets/check-icon.svg"
          platformId={platformId}
          result={result}
        />
      ),
    });
  };

  const failedVerificationToast = () => {
    toast({
      duration: 5000,
      isClosable: true,
      render: (result: any) => (
        <DoneToastContent
          title="Verification Failed"
          body="Please make sure you fulfill the requirements for this stamp."
          icon="../../assets/verification-failed.svg"
          platformId={platformId}
          result={result}
        />
      ),
    });
  };

  return (
    <SideBarContent
      currentPlatform={getPlatformSpec(platformId)}
      currentProviders={platFormGroupSpec}
      verifiedProviders={verifiedProviders}
      selectedProviders={selectedProviders}
      setSelectedProviders={setSelectedProviders}
      isLoading={isLoading}
      verifyButton={
        <button
          disabled={!canSubmit}
          onClick={handleFetchCredential}
          data-testid={`button-verify-${platformId}`}
          className="sidebar-verify-btn"
        >
          Verify
        </button>
      }
    />
  );
};