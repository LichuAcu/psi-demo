import { Server, Socket } from "socket.io";
import { createLogicalAnd } from "typescript";

type CipherTextsMessage = {
    ciphers: string;
    length: number;
};

type CipherTextsListMessage = {
    ciphers: string[];
};

type IntersectionMessage = {
    locations: string[];
};

const io: Server = new Server(4000, {
    cors: {
        origin: "*",
    },
    maxHttpBufferSize: 1e9,
});

io.on("connection", (socket: Socket) => {
    console.log("client connected", socket.id);

    socket.on("firstRoundCipherTexts", (message: CipherTextsMessage) => {
        console.log("----- firstRoundCipherTexts -----");
        socket.broadcast.emit("updatedFirstRoundCipherTexts", message);
    });

    socket.on("secondRoundCipherTexts", (message: CipherTextsListMessage) => {
        console.log("----- secondRoundCipherTexts -----");
        socket.broadcast.emit("updatedSecondRoundCipherTexts", message);
    });

    socket.on("postIntersection", (message: IntersectionMessage) => {
        console.log("----- postIntersection -----");
        // console.log(message);
        socket.broadcast.emit("updatedIntersection", message);
    });

    socket.on("disconnect", () => {
        console.log("client disconnected", socket.id);
    });
});
