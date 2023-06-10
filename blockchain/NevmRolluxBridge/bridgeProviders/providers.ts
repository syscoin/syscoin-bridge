import { ChaingeProvider } from "components/BridgeL1L2/OtherProviders/Providers/ChaingeProvider";
import { CoinifyProvider } from "components/BridgeL1L2/OtherProviders/Providers/CoinifyProvider";
import { BridgedNetwork, FiatMethod, OtherBridgeProvider } from "./types";

export const providers: OtherBridgeProvider[] = [
    {
        label: 'Chainge',
        code: 'chainge',
        description: 'Chainge 3rd party bridge provider',
        url: 'chainge.io',
        logoUrl: '/bridge-providers/chainge-logo.png',
        supportsCrypto: true,
        supportsFiat: false,
        enabled: true,
        component: ChaingeProvider,
        askOpenInNewTab: false,
        supportsDeposits: true,
        supportsWithdrawals: true,
        supportedInputs: [
            BridgedNetwork.SYS,
            BridgedNetwork.ETH,
            BridgedNetwork.BSC,
            BridgedNetwork.MATIC,
        ],
        supportedOutputs: [
            BridgedNetwork.SYS,
            BridgedNetwork.ETH,
            BridgedNetwork.BSC,
            BridgedNetwork.MATIC,
        ]
    },
    {
        label: 'Coinify',
        code: 'coinify',
        description: 'Coinify 3rd party bridge provider',
        url: 'coinify.com',
        logoUrl: '/bridge-providers/coinify-logo.png',
        supportsCrypto: false,
        supportsFiat: true,
        enabled: true,
        component: CoinifyProvider,
        askOpenInNewTab: false,
        supportsDeposits: true,
        supportsWithdrawals: true,
        supportedInputs: [
            FiatMethod.USD,
            FiatMethod.EUR,
            FiatMethod.CNY,
            FiatMethod.PLN,
            FiatMethod.JPY,
        ],
        supportedOutputs: [
            FiatMethod.USD,
            FiatMethod.EUR,
            FiatMethod.CNY,
            FiatMethod.PLN,
            FiatMethod.JPY,
        ]
    }
]