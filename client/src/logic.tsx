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
export const alice_encrypt_elements = (elements_alice: number[]): [string, number] => {
    console.log("Participating as Alice");
    console.log("=========================\nSTEP 2: encrypt elements\n=========================");

    const set_alice = Int32Array.from(elements_alice);
    const set_alice_length = set_alice.length;

    // Encode Alice's set
    const set_plaintexts_alice = encoder.encode(set_alice) as PlainText;

    // Encrypt each element in Alice's set
    // This is sent to Bob
    const set_ciphertexts_alice = encryptor.encrypt(set_plaintexts_alice) as CipherText;

    const set_ciphertexts_alice_string = set_ciphertexts_alice.save();

    console.log("Sending Alice's encrypted elements: \n", set_ciphertexts_alice_string);

    return [set_ciphertexts_alice_string, set_alice_length];
};

// Step 3 (with optimization)
export const bob_homomorphic_operations = (
    set_ciphertexts_alice_string: string,
    set_alice_length: number,
    elements_bob: number[]
): string[] => {
    console.log("Participating as Bob");
    console.log(
        "============================================\nSTEP 3: homomorphically compute intersection\n============================================"
    );
    console.log("(optimization) using batches of size " + batch_size);
    let final_products: string[] = [];
    let set_ciphertexts_alice: CipherText = seal.CipherText();

    set_ciphertexts_alice.load(context, set_ciphertexts_alice_string);

    // For the optimization, we split Bob's set into multiple subsets, each of size batch_size, for optimization
    const sets_plaintexts_bob: Int32Array[] = [];
    for (let i = 0; i < elements_bob.length; i += batch_size) {
        const batch = elements_bob.slice(i, i + batch_size);
        sets_plaintexts_bob.push(Int32Array.from(batch));
    }
    let counter = 0;
    sets_plaintexts_bob.forEach((set_plaintexts_bob) => {
        const final_product = seal.CipherText();

        // Homomorphically initialize result to first Alice's element - first Bob's element
        const first_element_bob = Int32Array.from(Array(set_alice_length).fill(set_plaintexts_bob[0]));
        const first_element_bob_encoded = encoder.encode(first_element_bob) as PlainText;
        evaluator.subPlain(set_ciphertexts_alice, first_element_bob_encoded, final_product);

        for (let i = 1; i < set_plaintexts_bob.length; i++) {
            const ith_element_bob = Int32Array.from(Array(set_alice_length).fill(set_plaintexts_bob[i]));
            const ith_element_bob_encoded = encoder.encode(ith_element_bob) as PlainText;
            const temp = seal.CipherText();
            evaluator.subPlain(set_ciphertexts_alice, ith_element_bob_encoded, temp);
            evaluator.multiply(final_product, temp, final_product);
        }

        let random_plaintext = new Int32Array(set_alice_length);
        let random_plaintext_encoded: PlainText;
        crypto.getRandomValues(random_plaintext);
        random_plaintext_encoded = encoder.encode(random_plaintext) as PlainText;
        evaluator.multiplyPlain(final_product, random_plaintext_encoded, final_product);

        const final_product_string = final_product.save();
        // console.log(
        //     "Randomized polynomial for ciphertexts " +
        //         counter * batch_size +
        //         " to " +
        //         Math.min((counter + 1) * batch_size, elements_bob.length) +
        //         ":\n",
        //     result_bob_string
        // );
        counter++;
        final_products.push(final_product_string);
    });

    return final_products;
};

// Step 4
export const alice_decrypt_intersection = (final_products: string[], set_alice_length: number): number[] => {
    console.log("Participating as Alice");
    console.log(
        "================================\nSTEP 4: decrypting intersections\n================================\n(belongs to the intersection iff decryption equals 0 in at least one batch)"
    );
    let intersection_indexes: number[] = [];
    let counter: number = 1;
    for (const final_product of final_products) {
        let final_product_ciphertext: CipherText = seal.CipherText();
        final_product_ciphertext.load(context, final_product);
        const decrypted = decryptor.decrypt(final_product_ciphertext) as PlainText;
        const decoded = encoder.decode(decrypted);
        // console.log("Intersections for batch number " + counter + ":", decoded.slice(0, set_alice_length));
        for (let i = 0; i < set_alice_length; i++) {
            if (decoded[i] == 0) {
                intersection_indexes.push(i);
            }
        }
        counter++;
    }

    console.log("Finished PSI\n");

    return intersection_indexes;
};

setup();
