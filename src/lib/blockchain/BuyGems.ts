import { CONFIG } from "lib/config";
import { fromWei } from "web3-utils";
import ABI from "./abis/BuyGems";
import { onboardingAnalytics } from "lib/onboardingAnalytics";
import { mfIapCompleted } from "lib/moonforgeAnalytics";
import { waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { config } from "features/wallet/WalletProvider";
import { polygon, polygonAmoy } from "viem/chains";

const address = CONFIG.BUY_GEMS_CONTRACT;

interface BuyBlockBucksArgs {
  account: `0x${string}`;
  signature: `0x${string}`;
  farmId: number;
  amount: number;
  deadline: number;
  fee: number;
}

export async function buyGemsMATIC({
  account,
  signature,
  farmId,
  amount,
  deadline,
  fee,
}: BuyBlockBucksArgs) {
  const hash = await writeContract(config, {
    chainId: CONFIG.NETWORK === "mainnet" ? polygon.id : polygonAmoy.id,
    abi: ABI,
    address: address as `0x${string}`,
    functionName: "buyGems",
    args: [
      signature,
      BigInt(farmId),
      BigInt(amount),
      BigInt(fee),
      BigInt(deadline),
    ],
    value: BigInt(fee),
    account,
  });
  await waitForTransactionReceipt(config, { hash });

  const maticValue = Number(fromWei(fee.toString()));

  onboardingAnalytics.logEvent("purchase", {
    currency: "MATIC",
    // Unique ID to prevent duplicate events
    transaction_id: `${Date.now()}-${farmId}`,
    value: maticValue,
    items: [
      {
        item_id: "Gem",
        item_name: "Gem",
        quantity: amount,
      },
    ],
  });

  // `amount` is the gem count, matching the fiat SKUs' `gems_<count>` shape.
  // The on-chain tx hash is the natural, real `transaction_id`.
  mfIapCompleted({
    product_id: `gems_${amount}`,
    price: maticValue,
    currency: "MATIC",
    transaction_id: hash,
    store: "web",
  });
}
