import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Container,
  Link,
  Typography,
} from "@mui/material";
import { GridExpandMoreIcon } from "@mui/x-data-grid";

interface IFAQ {
  question: string;
  answer: React.ReactNode | string;
}

const faqs: IFAQ[] = [
  {
    question: "What is Syscoin?",
    answer:
      "Syscoin is a dual-chain Layer 1 with a Bitcoin-compatible UTXO chain and an EVM-compatible NEVM chain. The chains operate in parallel and use SYS as the native asset.",
  },
  {
    question: "What is an SPT?",
    answer:
      "A Syscoin Platform Token (SPT) is a token issued on the Syscoin UTXO chain through its native asset protocol.",
  },
  {
    question: "What is SYSX?",
    answer:
      "SYSX is the UTXO-side bridge representation used when moving SYS between Syscoin UTXO and Syscoin NEVM. The bridge converts between SYS and SYSX at a 1:1 ratio during the transfer flow.",
  },
  {
    question: "How does the SYS bridge work?",
    answer:
      "The route is Syscoin UTXO SYS ↔ UTXO SYSX ↔ Syscoin NEVM SYS. Each transfer burns or freezes the source representation, verifies the resulting proof, and mints the corresponding amount on the destination chain.",
  },
  {
    question: "How long does a transfer take?",
    answer:
      "Syscoin targets a 2.5-minute block time. Some bridge steps wait for block inclusion or confirmation, so completion time varies with network conditions.",
  },
  {
    question: "Does Syscoin NEVM run on Ethereum?",
    answer:
      "No. Syscoin NEVM is Syscoin's EVM-compatible chain. It supports familiar Ethereum tools and wallets when they are configured for the Syscoin network.",
  },
  {
    question: "Which assets does this bridge support?",
    answer:
      "This interface supports moving SYS between Syscoin UTXO and Syscoin NEVM through SYSX. Other SPT or ERC-20 assets require a dedicated integration and are not available in this interface.",
  },
  {
    question: "Which wallets can I use?",
    answer:
      "Use Pali Wallet for the Syscoin UTXO side. Use MetaMask or a supported Pali Wallet configuration for Syscoin NEVM. Hardware wallets are not supported by this app.",
  },
  {
    question: "Does the bridge preserve the represented SYS supply?",
    answer:
      "Yes. The source amount is burned or frozen before the corresponding destination amount is minted, maintaining 1:1 accounting across the supported representations.",
  },
  {
    question: "Does the bridge use a custodian?",
    answer:
      "No third party takes custody of a transfer. Users authorize source-chain transactions, and protocol proofs authorize the destination-chain result. Smart-contract, software, network, and wallet risks still apply.",
  },
  {
    question: "Do I need SYS for transaction fees?",
    answer:
      "Bridge transactions may require SYS for UTXO transaction fees or NEVM gas. If the app reports an insufficient balance, add SYS to the indicated wallet. Fees vary with network conditions.",
  },
  {
    question: "Why move SYS between UTXO and NEVM?",
    answer:
      "Syscoin UTXO provides Bitcoin-style asset transactions, while Syscoin NEVM supports EVM applications and smart contracts. The bridge lets you choose the environment that fits your use case.",
  },
  {
    question: "Where can I get support?",
    answer: (
      <Typography>
        Open a ticket in Syscoin&apos;s official Discord server at{" "}
        <Link target="_blank" href="https://discord.gg/syscoin">
          discord.gg/syscoin
        </Link>
        . Request support for an incomplete transfer within 75 days of starting
        it.
      </Typography>
    ),
  },
];

const FAQ: React.FC = () => {
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h3" textAlign="center" sx={{ mb: 3 }} id="faq">
        FAQ
      </Typography>
      {faqs.map((faq, index) => (
        <Accordion key={index}>
          <AccordionSummary
            expandIcon={<GridExpandMoreIcon />}
            aria-controls={`faq${index}-header`}
            id={`faq${index}-header`}
          >
            <Typography color="primary">{faq.question}</Typography>
          </AccordionSummary>
          <AccordionDetails>{faq.answer}</AccordionDetails>
        </Accordion>
      ))}
    </Container>
  );
};

export default FAQ;
