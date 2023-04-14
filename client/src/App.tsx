import { useState, useEffect, createContext } from "react";
import { ChakraProvider, Box, VStack, Grid, theme, Input, Button, HStack } from "@chakra-ui/react";
import { io } from "socket.io-client";
import {
    setup,
    receiver_decrypt_intersection,
    receiver_encrypt_locations,
    sender_homomorphicaly_subtract_locations,
} from "./logic";

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
    locations: string[];
};

const initialStringList: string[] = [];
const initialNumberList: number[] = [];
const socket = io("ws://localhost:4000");

export const App = () => {
    const [storageLocations, setStorageLocations] = useState(initialStringList);
    const [intersection, setIntersection] = useState(initialNumberList);
    const [input, setInput] = useState("");

    const addLocations = (newLocations: string[]) => {
        let newList = storageLocations.concat(newLocations);
        setStorageLocations(newList);
    };

    function handleAdd() {
        // handle multiple inputs at once
        addLocations(input.split(","));
        setInput("");
        setIntersection(initialNumberList);
    }

    function handleClear() {
        setStorageLocations(initialStringList);
        setIntersection(initialNumberList);
    }

    function handleIntersect() {
        const locations_receiver = storageLocations.map(Number);
        const [set_ciphertexts_receiver, set_receiver_length] = receiver_encrypt_locations(locations_receiver);
        const message: CipherTextsMessage = {
            ciphers: set_ciphertexts_receiver,
            length: set_receiver_length,
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
            const intersection_locations = receiver_decrypt_intersection(ciphers, length);
            setIntersection(intersection_locations);
            const message = { intersection_locations };
            socket.emit("postIntersection", message);
        });

        socket.on("updatedIntersection", ({ locations }: IntersectionMessage) => {
            // console.log("listened updatedIntersection");
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        socket.removeAllListeners("updatedFirstRoundCipherTexts");

        socket.on("updatedFirstRoundCipherTexts", async ({ ciphers, length }: CipherTextsMessage) => {
            // console.log("listened updatedFirstRoundCipherTexts");
            const locations_sender = storageLocations.map(Number);
            const secondRoundCiphers: string[] = await sender_homomorphicaly_subtract_locations(
                ciphers,
                length,
                locations_sender
            );
            const message: CipherTextsListMessage = { ciphers: secondRoundCiphers, length: length };
            socket.emit("secondRoundCipherTexts", message);
        });
    }, [storageLocations]);

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
                                placeholder="Storage location"
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
                            {storageLocations.map((item, idx) => (
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
