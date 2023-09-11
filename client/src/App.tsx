import { useState, useEffect, createContext } from "react";
import { ChakraProvider, Box, VStack, Grid, theme, Input, Button, HStack, Text } from "@chakra-ui/react";
import { io } from "socket.io-client";
import { setup, alice_decrypt_intersection, alice_encrypt_elements, bob_homomorphic_operations } from "./logic";

localStorage.debug = "*";

type CipherTextsMessage = {
    ciphers: string;
    length: number;
};

type CipherTextsListMessage = {
    ciphers: string[];
    length: number;
};

type IntersectionMessage = {
    elements: string[];
};

const initialStringList: string[] = [];
const initialNumberList: number[] = [];
const socket = io("ws://localhost:4000");

export const App = () => {
    const [elements, setElements] = useState(initialStringList);
    const [intersection, setIntersection] = useState(initialNumberList);
    const [input, setInput] = useState("");

    const addElements = (newElements: string[]) => {
        let newList = elements.concat(newElements);
        setElements(newList);
    };

    function handleAdd() {
        // handle multiple inputs at once
        addElements(input.split(","));
        setInput("");
        setIntersection(initialNumberList);
    }

    function handleClear() {
        setElements(initialStringList);
        setIntersection(initialNumberList);
    }

    function handleIntersect() {
        const elements_alice = elements.map(Number);
        const [set_ciphertexts_alice, set_alice_length] = alice_encrypt_elements(elements_alice);
        const message: CipherTextsMessage = {
            ciphers: set_ciphertexts_alice,
            length: set_alice_length,
        };
        socket.emit("firstRoundCipherTexts", message);
    }

    useEffect(() => {
        socket.on("connect", () => {
            // console.log("connected to server");
        });

        socket.on("disconnect", () => {
            // console.log("disconnected from server");
        });

        socket.on("updatedSecondRoundCipherTexts", ({ ciphers, length }: CipherTextsListMessage) => {
            // console.log("listened updatedSecondRoundCipherTexts");
            const intersection_elements = alice_decrypt_intersection(ciphers, length);
            setIntersection(intersection_elements);
            const message = { intersection_elements };
            socket.emit("postIntersection", message);
        });

        socket.on("updatedIntersection", ({ elements }: IntersectionMessage) => {
            // console.log("listened updatedIntersection");
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        socket.removeAllListeners("updatedFirstRoundCipherTexts");

        socket.on("updatedFirstRoundCipherTexts", ({ ciphers, length }: CipherTextsMessage) => {
            // console.log("listened updatedFirstRoundCipherTexts");
            const elements_bob = elements.map(Number);
            const secondRoundCiphers: string[] = bob_homomorphic_operations(ciphers, length, elements_bob);
            const message: CipherTextsListMessage = { ciphers: secondRoundCiphers, length: length };
            socket.emit("secondRoundCipherTexts", message);
        });
    }, [elements]);

    return (
        <ChakraProvider theme={theme}>
            <Box textAlign="center" fontSize="xl">
                <Grid minH="100vh" p={3}>
                    <VStack spacing={8} alignSelf="start" justifySelf="center" marginTop="2em" width="50%">
                        <HStack alignItems={"center"}>
                            <img src={"./flashbots.png"} style={{ height: "4rem", objectFit: "contain" }} />
                            <img src={"./semiotic.jpeg"} style={{ height: "4rem", objectFit: "contain" }} />
                        </HStack>
                        <HStack width="100%" paddingTop="2em">
                            <Input
                                placeholder="Enter integer values separated by commas"
                                onChange={(event) => setInput(event.target.value)}
                                value={input}
                            />
                            <Button width="10em" onClick={handleAdd}>
                                Add
                            </Button>
                            <Button width="10em" backgroundColor="#ffc7c7" onClick={handleClear}>
                                Clear
                            </Button>
                        </HStack>
                        <Button width="10em" onClick={handleIntersect}>
                            Intersect
                        </Button>
                        <VStack alignSelf="center" alignItems="center">
                            {elements.map((item, idx) => (
                                <Box
                                    width="10em"
                                    borderRadius=".2em"
                                    backgroundColor={intersection.includes(idx) ? "#aef5b8" : ""}
                                    key={idx}
                                >
                                    {item}
                                </Box>
                            ))}
                        </VStack>
                    </VStack>
                </Grid>
            </Box>
        </ChakraProvider>
    );
};
