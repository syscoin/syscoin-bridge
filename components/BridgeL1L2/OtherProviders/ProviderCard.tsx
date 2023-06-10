import { Card, CardBody, Button, Text, Flex, Image, Box, Link, Spacer, IconButton } from "@chakra-ui/react";
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { OtherBridgeProvider } from "blockchain/NevmRolluxBridge/bridgeProviders/types";
import React, { FC } from "react";

export type ProviderCardProps = {
    config: OtherBridgeProvider,
    onButtonClick: () => void,
}

export const ProviderCard: FC<ProviderCardProps> = ({ config, onButtonClick }) => {
    return (
        <Card mt={4} w={['300px', 'sm', 'md', 'lg']} maxH={'200px'} cursor="pointer">
            <CardBody>
                <Flex alignItems='center' direction='row' justifyContent='flex-start'>
                    <Box boxSize="50px">
                        <Image alt="logo" src={config.logoUrl ?? ''} fallbackSrc="https://via.placeholder.com/150" boxSize="100%" objectFit="contain" />
                    </Box>
                    <Text fontSize={'xl'} ml={4}>
                        {config.description}
                    </Text>
                    <Spacer />
                    <IconButton onClick={onButtonClick} aria-label="External Link" icon={<ExternalLinkIcon />} />
                </Flex>
                <Flex alignItems={'start'} direction={'row'}>
                    <Link isExternal href={`https://${config.url}` ?? ''}>
                        <Text fontSize={'sm'} mt={2}>
                            {config.url} <ExternalLinkIcon mx="2px" />
                        </Text>
                    </Link>
                </Flex>
            </CardBody>
        </Card>
    );
}