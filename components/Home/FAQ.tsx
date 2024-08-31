import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Container,
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
    answer: (
      <Typography>
        Syscoin is a decentralized modular blockchain that brings together Bitcoin&apos;s secure PoW, 
        Ethereum&apos;s flexible EVM, & scalable computation via Rollups (ZK & Optimistic). All of 
        these best elements are combined into a single plug-and-play network making an ultra 
        fast, scalable, low gas smart contract platform w/ proven security.
        The blockchain trifecta.

        Succinct technical description:
        Syscoin is a modular coordinated dual-chain EVM platform designed to give Rollups 
        optimal L1 data availability, & Bitcoin auxpow settlement enhanced w/ multi-quorum 
        finality that resists MEV attacks & selfish mining.
      </Typography>
    ),
  },
  {
    question: "How does the SYS bridge work?",
    answer: `The basic structure of how SYS bridge works is SYS (UTXO) <-> SYS (NEVM).

    The automated process will 1) burn your SYS 2) transfer the SYS to your NEVM address.  The same process occurs in reverse if moving SYS from NEVM to the Syscoin native UTXO blockchain.
    
    The total supply of SYS remains the same.`,
  },
  {
    question: "Does the NEVM run on Ethereum?",
    answer:
      "NEVM is a separate and distinct standard Ethereum Virtual Machine that is integrated into Syscoin in order to leverage the PoW security of Bitcoin and the benefits of holistically modular blockchain architecture. NEVM stands for Network-Enhanced Virtual Machine.",
  },
  {
    question: "Will this mean I can use Ledger, Myetherwallet, Metamask etc?",
    answer:
      "Your SYS will become compatible with all major service providers that serve EVM once it is moved across the bridge to NEVM.",
  },
  {
    question: "Syscoin supply will remain the same?",
    answer:
      "Yes. SYS (UTXO) + SYS (NEVM) = Total Circulating Supply. This supply is maintained via mint/burn as coins move across the bridge in either direction.",
  },
  {
    question:
      "What counterparty or custodian related risks and/or limitations do I incur when using Syscoin Bridge?",
    answer:
      "None. You maintain full possession and control of your funds at all times. Furthermore, market demand (such as with atomic swap) is not required to take advantage of Syscoin Bridge. These benefits are made possible by first-class integration with the NEVM layer through a custom opcode (sysblockhash and utilizing dual smart contracts and SPV proofs on both sides.",
  },
  {
    question:
      "Do I need gas to execute the smart contract, and if so how much?",
    answer:
      "You will need SYS gas on the NEVM to cover the costs of executing NEVM smart contracts. These costs will vary depending on the NEVM network. You can utilize the Syscoin Authenticated Faucet to get a small amount of SYS for gas: https://faucet.syscoin.org",
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
