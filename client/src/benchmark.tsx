import { setup, alice_decrypt_intersection, alice_encrypt_elements, bob_homomorphic_operations } from "./logic";

// Steps 0 and 1
let elements_alice = [1, 2, 3, 4, 5, 6].map(Number);
let elements_bob = [2, 4, 6].map(Number);

setup();

// Step 2
const [set_ciphertexts_alice, set_alice_length] = alice_encrypt_elements(elements_alice);

// Step 3
const polynomial_ciphers: string[] = bob_homomorphic_operations(set_ciphertexts_alice, set_alice_length, elements_bob);

// Step 4
const intersection_elements = alice_decrypt_intersection(polynomial_ciphers, set_alice_length);

console.log(intersection_elements);
