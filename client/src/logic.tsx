import SEAL from "node-seal";
import { CipherText } from "node-seal/implementation/cipher-text";
import { PlainText } from "node-seal/implementation/plain-text";
import { BatchEncoder } from "node-seal/implementation/batch-encoder";
import { Encryptor } from "node-seal/implementation/encryptor";
import { SEALLibrary } from "node-seal/implementation/seal";
import { Context } from "node-seal/implementation/context";
import { Evaluator } from "node-seal/implementation/evaluator";
import { Decryptor } from "node-seal/implementation/decryptor";

let seal: SEALLibrary;
let context: Context;
let encoder: BatchEncoder;
let encryptor: Encryptor;
let decryptor: Decryptor;
let evaluator: Evaluator;

const batch_size = 3;

// Step 1
export const setup = async () => {
    console.log("===============================\nSTEP 1: setup\n===============================");
    seal = await SEAL();
    const schemeType = seal.SchemeType.bfv;
    const securityLevel = seal.SecurityLevel.tc128;
    const polyModulusDegree = 8192;
    const bitSizes = [36, 36, 37, 38, 39];
    const bitSize = 20;

    const parms = seal.EncryptionParameters(schemeType);

    // Set the PolyModulusDegree
    parms.setPolyModulusDegree(polyModulusDegree);

    // Create a suitable set of CoeffModulus primes
    parms.setCoeffModulus(seal.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes)));

    // Set the PlainModulus to a prime of bitSize 20.
    parms.setPlainModulus(seal.PlainModulus.Batching(polyModulusDegree, bitSize));

    context = seal.Context(
        parms, // Encryption Parameters
        true, // ExpandModChain
        securityLevel // Enforce a security level
    );

    if (!context.parametersSet()) {
        throw new Error(
            "Could not set the parameters in the given context. Please try different encryption parameters."
        );
    }

    encoder = seal.BatchEncoder(context);
    const keyGenerator = seal.KeyGenerator(context);
    const publicKey = keyGenerator.createPublicKey();
    const secretKey = keyGenerator.secretKey();
    encryptor = seal.Encryptor(context, publicKey);
    decryptor = seal.Decryptor(context, secretKey);
    evaluator = seal.Evaluator(context);
};

// Step 2
export const receiver_encrypt_locations = (locations_receiver: number[]): [string, number] => {
    console.log("participating as receiver");
    console.log("=========================\nSTEP 2: encrypt locations\n=========================");

    const set_receiver = Int32Array.from(locations_receiver);
    const set_receiver_length = set_receiver.length;

    // encode receiver set
    const set_plaintexts_receiver = encoder.encode(set_receiver) as PlainText;

    // encrypt each element in the receiver set
    // this is sent to the sender
    const set_ciphertexts_receiver = encryptor.encrypt(set_plaintexts_receiver) as CipherText;

    const set_ciphertexts_receiver_string = set_ciphertexts_receiver.save();

    console.log("sending encrypted locations: \n", set_ciphertexts_receiver_string);

    return [set_ciphertexts_receiver_string, set_receiver_length];
};

// step 3 + optimization
export const sender_homomorphicaly_subtract_locations = (
    set_ciphertexts_receiver_string: string,
    set_receiver_length: number,
    locations_sender: number[]
): string[] => {
    console.log("participating as sender");
    console.log(
        "============================================\nSTEP 3: homomorphically compute intersection\n============================================"
    );
    console.log("(optimization) using batches of size " + batch_size);
    let results_sender: string[] = [];
    let set_ciphertexts_receiver: CipherText = seal.CipherText();

    set_ciphertexts_receiver.load(context, set_ciphertexts_receiver_string);

    // as specified in the README, we split the sender set into multiple subsets, each of size batch_size, for optimization
    const sets_plaintexts_sender = [];
    for (let i = 0; i < locations_sender.length; i += batch_size) {
        const batch = locations_sender.slice(i, i + batch_size);
        sets_plaintexts_sender.push(Int32Array.from(batch));
    }
    let counter = 0;
    sets_plaintexts_sender.forEach((set_plaintexts_sender) => {
        // perform step 3 of the algorithm with each subset
        let random_plaintext = new Int32Array(set_receiver_length);
        crypto.getRandomValues(random_plaintext);
        const random_plaintext_encoded = encoder.encode(random_plaintext) as PlainText;

        const result_sender = seal.CipherText();
        const result_sender_first_value = Int32Array.from(Array(set_receiver_length).fill(set_plaintexts_sender[0]));
        const result_sender_first_value_encoded = encoder.encode(result_sender_first_value) as PlainText;

        evaluator.subPlain(set_ciphertexts_receiver, result_sender_first_value_encoded, result_sender);

        for (let i = 1; i < set_plaintexts_sender.length; i++) {
            const ith_value_sender = Int32Array.from(Array(set_receiver_length).fill(set_plaintexts_sender[i]));
            const ith_value_sender_encoded = encoder.encode(ith_value_sender) as PlainText;
            const temp = seal.CipherText();
            evaluator.subPlain(set_ciphertexts_receiver, ith_value_sender_encoded, temp);
            evaluator.multiply(result_sender, temp, result_sender);
        }

        evaluator.multiplyPlain(result_sender, random_plaintext_encoded, result_sender);
        const result_sender_string = result_sender.save();
        console.log(
            "randomized polynomial for ciphertexts " +
                counter * batch_size +
                " to " +
                Math.min((counter + 1) * batch_size, locations_sender.length) +
                ":\n",
            result_sender_string
        );
        counter++;
        results_sender.push(result_sender_string);
    });

    return results_sender;
};

// step 4
export const receiver_decrypt_intersection = (results_sender: string[], set_receiver_length: number): number[] => {
    console.log(
        "================================\nSTEP 4: decrypting intersections\n================================\n(belongs to the intersection iff decryption equals 0 in at least one batch)"
    );
    let intersection_indexes = [];
    let counter: number = 1;
    for (const result_sender of results_sender) {
        let result_sender_ciphertext: CipherText = seal.CipherText();
        result_sender_ciphertext.load(context, result_sender);
        const decrypted = decryptor.decrypt(result_sender_ciphertext) as PlainText;
        const decoded = encoder.decode(decrypted);
        console.log("intersections for batch number " + counter + ":", decoded.slice(0, set_receiver_length));
        for (let i = 0; i < set_receiver_length; i++) {
            if (decoded[i] == 0) {
                intersection_indexes.push(i);
            }
        }
        counter++;
    }

    console.log("finished PSI\n");

    return intersection_indexes;
};

setup();
