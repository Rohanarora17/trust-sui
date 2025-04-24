import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiObjectChange } from '@mysten/sui/client';

// Configuration parameters
const PACKAGE_ID = '0xcc601cbb789841aea03b0a11b74f058600912797f5e7ea5394ae117d0fdfea2e'; // Replace with your package ID
const BOND_AMOUNT = 0.01; // Only 0.01 SUI for bond tests
const JOIN_AMOUNT = 0.01; // Only 0.01 SUI for joining bonds
const SKIP_DOMAIN_VERIFICATION = true; // Set to false if you want to test domain verification

// Testing configuration
const SAFE_MODE = true; // When true, skips tests that are likely to fail
const REUSE_BOND = false; // When true, tries to find and reuse an existing bond instead of creating a new one

// Initialize client
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
console.log("Connected to network:", suiClient.network);

// Create keypair from your private key (IMPORTANT: Use environment variables for the private key in production!)
// This is just for testing - secure your keys properly in real applications
const user1Keypair = Ed25519Keypair.fromSecretKey("suiprivkey1qpsylkvfafzegxk36rqy5euzreurcpkdvhltmfu020qhadhzcux5q5dgjrf");
const USER1_ADDRESS = user1Keypair.toSuiAddress();
console.log("Testing with address:", USER1_ADDRESS);

// For the second user, we'll use a derived keypair for testing
// In production, you'd use a real keypair for the second user
const user2KeypairData = new Uint8Array(32).fill(2);
const user2Keypair = Ed25519Keypair.fromSecretKey(user2KeypairData);
const USER2_ADDRESS = user2Keypair.toSuiAddress();
console.log("Test recipient address:", USER2_ADDRESS);

// Helper to convert from MIST to SUI
const formatBalance = (balance: string | number): number => {
    return Number(balance) / Number(MIST_PER_SUI);
};

// Check balance before proceeding with any operations
async function checkAndVerifyBalance(address: string, minimumRequired: number): Promise<boolean> {
    try {
        const balance = await suiClient.getBalance({
            owner: address,
        });
        const suiBalance = formatBalance(balance.totalBalance);
        console.log(`Balance for ${address}: ${suiBalance} SUI`);
        
        if (suiBalance < minimumRequired) {
            console.error(`Insufficient balance. Need at least ${minimumRequired} SUI, but have ${suiBalance} SUI.`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Error checking balance for ${address}:`, error);
        return false;
    }
}

// Find the ProfileRegistry shared object
async function findProfileRegistry(): Promise<string> {
    // Known registry ID from the publish output
    const registryId = '0x67f12b8fb45ffd40d779addcafabcebb6030bbc75216d69039ce527b08ea5c85';
    console.log(`Using known ProfileRegistry with ID: ${registryId}`);
    return registryId;
}
// async function findProfileRegistry(): Promise<string> {
//     console.log("Finding ProfileRegistry object...");
//     try {
//         const objects = await suiClient.getOwnedObjects({
//             owner: '0x0000000000000000000000000000000000000000000000000000000000000000', // Shared objects have 0x0 as owner
//             filter: {
//                 StructType: `${PACKAGE_ID}::trust::ProfileRegistry`
//             },
//             options: {
//                 showContent: true,
//             }
//         });
        
//         if (!objects.data || objects.data.length === 0) {
//             throw new Error("No ProfileRegistry object found. Make sure you've published the contract correctly.");
//         }
        
//         const registryId = objects.data[0].data?.objectId;
//         if (!registryId) {
//             throw new Error("Invalid ProfileRegistry object");
//         }
        
//         console.log(`Found ProfileRegistry with ID: ${registryId}`);
//         return registryId;
//     } catch (error) {
//         console.error("Error finding ProfileRegistry:", error);
//         throw error;
//     }
// }

// Helper to find created object ID of specific type
const findCreatedObjectId = (objectChanges: SuiObjectChange[] | undefined, typeSubstring: string): string | undefined => {
    if (!objectChanges) return undefined;
    for (const change of objectChanges) {
        if (
            change.type === 'created' &&
            'objectType' in change &&
            change.objectType.includes(typeSubstring) &&
            'objectId' in change
        ) {
            return change.objectId;
        }
    }
    return undefined;
};

// Get SuiNS Registry object ID - dummy for testnet
async function getSuiNSRegistryId(): Promise<string> {
    // In a real implementation, you would query for the SuiNS registry
    // This hardcoded ID is for testnet - replace with the actual SuiNS registry ID for your network
    const testnetRegistryId = '0x300369e8909b9a6464da265b9a5a9ab6fe2158a040e84e808628cde7a07ee5a3';
    return testnetRegistryId;
}

// Function to create a trust profile with the updated contract
async function createTrustProfile(
    keypair: Ed25519Keypair,
    name: string,
    registryId: string,
    shouldVerifyDomain: boolean = false
): Promise<string> {
    console.log(`Creating trust profile for ${keypair.toSuiAddress()} with name "${name}"...`);
    const tx = new Transaction();
    
    // Get SuiNS object ID (always needed by the contract)
    const suinsId = await getSuiNSRegistryId();
    
    // Build arguments
    const args = [
        tx.object(registryId),
        tx.pure.string(name),
        tx.pure.bool(shouldVerifyDomain),
        tx.object(suinsId),  // Always include SuiNS object
        tx.object('0x6'),    // Clock
    ];
    
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::create_trust_profile`,
        arguments: args,
    });
    
    console.log("Executing trust profile creation transaction...");
    const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });
    
    if (result.effects?.status.status !== 'success') {
        throw new Error(`Failed to create trust profile: ${result.effects?.status.error}`);
    }
    
    // Handle null case by converting it to undefined
    const profileId = findCreatedObjectId(result.objectChanges ?? undefined, '::trust::TrustProfile');
    if (!profileId) {
        throw new Error("Failed to create trust profile - no profile object found in transaction result");
    }
    console.log(`Created trust profile with ID: ${profileId}`);
    return profileId;
}

// Function to get profile data using the new get_profile_data function
async function getProfileData(
    profileId: string
): Promise<{
    name: string;
    totalBonds: number;
    activeBonds: number;
    withdrawnBonds: number;
    brokenBonds: number;
    moneyInActiveBonds: number;
    moneyInWithdrawnBonds: number;
    moneyInBrokenBonds: number;
    trustScore: number;
    createdAt: number;
    updatedAt: number;
}> {
    console.log(`Fetching profile data for ${profileId}...`);
    
    try {
        // For simplicity, we'll fetch the object directly
        const profile = await suiClient.getObject({
            id: profileId,
            options: { showContent: true },
        });
        
        if (!profile.data || profile.data.content?.dataType !== 'moveObject') {
            throw new Error("Invalid profile object");
        }
        
        const fields = profile.data.content.fields as {
            name: string;
            total_bonds: string | number;
            active_bonds: string | number;
            withdrawn_bonds: string | number;
            broken_bonds: string | number;
            money_in_active_bonds: string | number;
            money_in_withdrawn_bonds: string | number;
            money_in_broken_bonds: string | number;
            trust_score: string | number;
            created_at: string | number;
            updated_at: string | number;
        };
        
        return {
            name: fields.name,
            totalBonds: Number(fields.total_bonds),
            activeBonds: Number(fields.active_bonds),
            withdrawnBonds: Number(fields.withdrawn_bonds),
            brokenBonds: Number(fields.broken_bonds),
            moneyInActiveBonds: formatBalance(fields.money_in_active_bonds),
            moneyInWithdrawnBonds: formatBalance(fields.money_in_withdrawn_bonds),
            moneyInBrokenBonds: formatBalance(fields.money_in_broken_bonds),
            trustScore: Number(fields.trust_score),
            createdAt: Number(fields.created_at),
            updatedAt: Number(fields.updated_at),
        };
    } catch (error) {
        console.error(`Error getting profile data:`, error);
        throw new Error(`Failed to get profile data: ${error}`);
    }
}

// Function to get a profile ID from the registry
async function getProfileId(
    registryId: string,
    userAddress: string
): Promise<string> {
    console.log(`Looking up profile ID for address ${userAddress}...`);
    
    try {
        // For simplicity in testing, we'll query owned objects directly
        const objects = await suiClient.getOwnedObjects({
            owner: userAddress,
            filter: {
                StructType: `${PACKAGE_ID}::trust::TrustProfile`
            },
            options: {
                showContent: true,
            }
        });
        
        if (!objects.data || objects.data.length === 0) {
            throw new Error(`No profile found for address ${userAddress}`);
        }
        
        const profileId = objects.data[0].data?.objectId;
        if (!profileId) {
            throw new Error(`Invalid profile for address ${userAddress}`);
        }
        
        console.log(`Found profile ID: ${profileId}`);
        return profileId;
    } catch (error) {
        console.error("Error finding profile:", error);
        throw error;
    }
}

// Function to create a bond
async function createBond(
    fromKeypair: Ed25519Keypair,
    fromProfileId: string,
    toAddress: string,
    amount: number
): Promise<string> {
    console.log(`Creating bond from ${fromKeypair.toSuiAddress()} to ${toAddress} with ${amount} SUI...`);
    
    // Check balance first
    const hasEnoughBalance = await checkAndVerifyBalance(fromKeypair.toSuiAddress(), amount + 0.01); // Adding 0.01 for gas
    if (!hasEnoughBalance) {
        throw new Error("Insufficient balance to create bond");
    }
    
    const tx = new Transaction();
    const amountInMist = Math.floor(amount * Number(MIST_PER_SUI));
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
    
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::create_bond`,
        arguments: [
            tx.object(fromProfileId),
            tx.pure.address(toAddress),
            coin,
            tx.object('0x6'), // Clock
        ],
    });
    
    console.log("Executing bond creation transaction...");
    const result = await suiClient.signAndExecuteTransaction({
        signer: fromKeypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });
    
    if (result.effects?.status.status !== 'success') {
        throw new Error(`Failed to create bond: ${result.effects?.status.error}`);
    }
    
    // Handle null case by converting it to undefined
    const bondId = findCreatedObjectId(result.objectChanges ?? undefined, '::trust::TrustBond');
    if (!bondId) {
        throw new Error("Failed to create bond - no bond object found in transaction result");
    }
    console.log(`Created bond with ID: ${bondId}`);
    return bondId;
}

// Function to join a bond
async function joinBond(
    keypair: Ed25519Keypair,
    bondId: string,
    profileId: string,
    amount: number
): Promise<void> {
    console.log(`Joining bond ${bondId} with ${amount} SUI...`);
    
    // Check balance first
    const hasEnoughBalance = await checkAndVerifyBalance(keypair.toSuiAddress(), amount + 0.01); // Adding 0.01 for gas
    if (!hasEnoughBalance) {
        throw new Error("Insufficient balance to join bond");
    }
    
    const tx = new Transaction();
    const amountInMist = Math.floor(amount * Number(MIST_PER_SUI));
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
    
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::join_bond`,
        arguments: [
            tx.object(bondId),
            tx.object(profileId),
            coin,
            tx.object('0x6'), // Clock
        ],
    });
    
    console.log("Executing bond join transaction...");
    const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    
    if (result.effects?.status.status !== 'success') {
        throw new Error(`Failed to join bond: ${result.effects?.status.error}`);
    }
    
    console.log(`Successfully joined bond ${bondId}`);
}

// Function to withdraw from a bond
async function withdrawBond(
    keypair: Ed25519Keypair,
    bondId: string,
    profileId: string
): Promise<void> {
    console.log(`Withdrawing from bond ${bondId}...`);
    const tx = new Transaction();
    
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::withdraw_bond`,
        arguments: [
            tx.object(bondId),
            tx.object(profileId),
            tx.object('0x6'), // Clock
        ],
    });
    
    console.log("Executing bond withdrawal transaction...");
    const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    
    if (result.effects?.status.status !== 'success') {
        throw new Error(`Failed to withdraw from bond: ${result.effects?.status.error}`);
    }
    
    console.log(`Successfully withdrawn from bond ${bondId}`);
}

// Function to break a bond
async function breakBond(
    keypair: Ed25519Keypair,
    bondId: string,
    profileId: string
): Promise<void> {
    console.log(`Breaking bond ${bondId}...`);
    const tx = new Transaction();
    
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::break_bond`,
        arguments: [
            tx.object(bondId),
            tx.object(profileId),
            tx.object('0x6'), // Clock
        ],
    });
    
    console.log("Executing bond break transaction...");
    const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    
    if (result.effects?.status.status !== 'success') {
        throw new Error(`Failed to break bond: ${result.effects?.status.error}`);
    }
    
    console.log(`Successfully broken bond ${bondId}`);
}

// Function to get bond info
async function getBondInfo(bondId: string): Promise<{
    user1: string;
    user2: string;
    bondType: number;
    bondStatus: number;
    moneyByUser1: number;
    moneyByUser2: number;
}> {
    console.log(`Getting info for bond ${bondId}...`);
    try {
        const bond = await suiClient.getObject({
            id: bondId,
            options: { showContent: true },
        });
        
        if (bond.data?.content?.dataType !== 'moveObject') {
            throw new Error("Invalid bond object");
        }
        
        // Type assertion for TrustBond fields
        const fields = bond.data.content.fields as {
            user_1: string;
            user_2: string;
            bond_type: string | number;
            bond_status: string | number;
            money_by_user_1: { value: string | number };
            money_by_user_2: { value: string | number };
            bond_amount?: string | number;
            created_at?: string | number;
            updated_at?: string | number;
            id?: { id: string };
        };
        
        // Extract values
        const moneyByUser1 = fields.money_by_user_1?.value !== undefined 
            ? Number(fields.money_by_user_1.value) 
            : 0;
        
        const moneyByUser2 = fields.money_by_user_2?.value !== undefined 
            ? Number(fields.money_by_user_2.value) 
            : 0;
        
        const bondInfo = {
            user1: fields.user_1,
            user2: fields.user_2,
            bondType: Number(fields.bond_type),
            bondStatus: Number(fields.bond_status),
            moneyByUser1: formatBalance(moneyByUser1),
            moneyByUser2: formatBalance(moneyByUser2),
        };
        
        console.log(`Bond info: 
  User1: ${bondInfo.user1} (${bondInfo.moneyByUser1} SUI)
  User2: ${bondInfo.user2} (${bondInfo.moneyByUser2} SUI)
  Type: ${bondInfo.bondType} (${bondInfo.bondType === 0 ? 'one-way' : 'two-way'})
  Status: ${bondInfo.bondStatus} (${bondInfo.bondStatus === 0 ? 'active' : bondInfo.bondStatus === 1 ? 'withdrawn' : 'broken'})`);
        
        return bondInfo;
    } catch (error) {
        console.error(`Error getting bond info for ${bondId}:`, error);
        throw error;
    }
}

// Get trust score directly from a profile
async function getTrustScore(profileId: string): Promise<number> {
    console.log(`Getting trust score for profile ${profileId}...`);
    
    try {
        const profile = await suiClient.getObject({
            id: profileId,
            options: { showContent: true },
        });
        
        if (!profile.data || profile.data.content?.dataType !== 'moveObject') {
            throw new Error("Invalid profile object");
        }
        
        // Get trust score field
        const fields = profile.data.content.fields as { trust_score: string | number };
        const trustScore = Number(fields.trust_score);
        console.log(`Trust score for ${profileId}: ${trustScore}`);
        return trustScore;
    } catch (error) {
        console.error(`Error getting trust score:`, error);
        throw error;
    }
}

// Optional: Domain verification test
async function verifyDomain(name: string): Promise<boolean> {
    if (SKIP_DOMAIN_VERIFICATION) {
        console.log("Skipping domain verification test...");
        return false;
    }
    
    console.log(`Verifying domain: ${name}...`);
    const suiNSRegistryId = await getSuiNSRegistryId();
    const transaction = new Transaction();
    
    transaction.moveCall({
        target: `${PACKAGE_ID}::trust::verify_domain`,
        arguments: [
            transaction.pure.string(name),
            transaction.object(suiNSRegistryId),
            transaction.object('0x6'), // Clock object
        ],
    });
    
    try {
        const result = await suiClient.devInspectTransactionBlock({
            sender: USER1_ADDRESS,
            transactionBlock: transaction,
        });
        
        if (!result.results || !result.results[0]?.returnValues) {
            console.log("No result from domain verification");
            return false;
        }
        
        // Parse the boolean result
        const returnValue = result.results[0].returnValues[0];
        
        // Check array structure before accessing elements
        if (Array.isArray(returnValue) && returnValue.length > 0) {
            // Handle nested array structure [[1]] or [1] correctly
            const boolValue = Array.isArray(returnValue[0]) 
                ? returnValue[0][0]    // [[1]] format
                : returnValue[0];      // [1] format
                
            const isValid = boolValue === 1;
            console.log(`Domain ${name} verification result: ${isValid}`);
            return isValid;
        }
        
        console.log(`Domain ${name} verification failed - unexpected return format`);
        return false;
    } catch (error) {
        console.error("Error verifying domain:", error);
        return false;
    }
}

async function hasTrustProfile(
    registryId: string,
    userAddress: string
): Promise<boolean> {
    console.log(`Checking if address ${userAddress} has a trust profile...`);
    
    try {
        const tx = new Transaction();
        
        tx.moveCall({
            target: `${PACKAGE_ID}::trust::has_trust_profile`,
            arguments: [
                tx.object(registryId),        // ProfileRegistry object
                tx.pure.address(userAddress), // User address
            ],
        });
        
        const result = await suiClient.devInspectTransactionBlock({
            sender: userAddress, // Any address can call this read-only function
            transactionBlock: tx,
        });
        
        if (!result.results || !result.results[0]?.returnValues) {
            throw new Error("No result from has_trust_profile call");
        }
        
        // Parse the boolean result
        const returnValue = result.results[0].returnValues[0];
        
        // Handle array structure (Sui returns values as [[value], type])
        if (!Array.isArray(returnValue)) {
            throw new Error("Unexpected return format from has_trust_profile: not an array");
        }
        
        // Extract the boolean value (1 = true, 0 = false)
        const boolValue = Array.isArray(returnValue[0]) ? returnValue[0][0] : returnValue[0];
        const hasProfile = boolValue === 1;
        
        console.log(`Address ${userAddress} has trust profile: ${hasProfile}`);
        return hasProfile;
    } catch (error: any) {
        console.error(`Error checking trust profile for ${userAddress}:`, error);
        throw new Error(`Failed to check trust profile: ${error.message}`);
    }
}

// Main test function
async function runTests() {
    console.log("Starting trust contract tests on testnet...");
    
    try {
        // Check balance before starting any operations
        const hasEnoughBalance = await checkAndVerifyBalance(USER1_ADDRESS, 0.1); // Need at least 0.1 SUI
        if (!hasEnoughBalance) {
            throw new Error("Insufficient balance to run tests. Add more SUI to your testnet address.");
        }
        
        // Find the ProfileRegistry object
        const registryId = await findProfileRegistry();
        console.log(`Using ProfileRegistry with ID: ${registryId}`);


        const hasProfile = await hasTrustProfile(registryId, USER1_ADDRESS);
        console.log(`Has profile: ${hasProfile}`);
        
        // Step 1: Check if profile exists, create if it doesn't
        // console.log("\n=== Test: Trust Profile ===");
        // let user1ProfileId;
        // try {
        //     user1ProfileId = await getProfileId(registryId, USER1_ADDRESS);
        //     console.log(`Found existing profile: ${user1ProfileId}`);
        // } catch (error) {
        //     console.log("No existing profile found, creating a new one...");
        //     user1ProfileId = await createTrustProfile(user1Keypair, "testuser", registryId, false);
        // }
        // //set timeout to 10 seconds
        // setTimeout(() => {
        //     console.log("Profile data");
        // }, 10000);

        // // Get profile data
        // const profileData = await getProfileData(user1ProfileId);
        // console.log("Profile data:", profileData);
        
        // // Step 2: Create a test bond (using minimal SUI amount)
        // console.log("\n=== Test: Create Bond ===");
        // const bondId = await createBond(user1Keypair, user1ProfileId, USER2_ADDRESS, BOND_AMOUNT);
        
        // // Wait briefly for the transaction to be indexed
        // console.log("Waiting for transaction to be processed...");
        // await new Promise(resolve => setTimeout(resolve, 2000));
        
        // // Verify the bond was created correctly
        // const bondInfo = await getBondInfo(bondId);
        
        // // Step 3: Optional advanced tests (can be commented out to save SUI)
        // const runAdvancedTests = false; // Set to true to run these tests
        // if (runAdvancedTests) {
        //     // Test domain verification
        //     if (!SKIP_DOMAIN_VERIFICATION) {
        //         console.log("\n=== Test: Domain Verification ===");
        //         await verifyDomain("example.sui"); // Replace with a domain you own
        //     }
            
        //     /* 
        //     // COMMENTED OUT: Join Bond Test - Likely to fail without proper setup
        //     // This requires the second user to have:
        //     // 1. A funded account with SUI
        //     // 2. A trust profile already created
        //     console.log("\n=== Test: Join Bond ===");
        //     try {
        //         // First check if user2 has a profile
        //         let user2ProfileId;
        //         try {
        //             user2ProfileId = await getProfileId(registryId, USER2_ADDRESS);
        //         } catch (error) {
        //             console.log("User2 has no profile - this test will fail");
        //             throw new Error("User2 needs a profile to join bond");
        //         }
                
        //         // Check if user2 has funds
        //         const user2HasFunds = await checkAndVerifyBalance(USER2_ADDRESS, JOIN_AMOUNT + 0.01);
        //         if (!user2HasFunds) {
        //             throw new Error("User2 needs funds to join bond");
        //         }
                
        //         await joinBond(user2Keypair, bondId, user2ProfileId, JOIN_AMOUNT);
                
        //         // Show updated bond info
        //         await getBondInfo(bondId);
        //     } catch (error) {
        //         console.log("Skipping bond join test:", error);
        //     }
        //     */
            
        //     // Withdraw from the bond (only user1 can do this safely)
        //     console.log("\n=== Test: Withdraw Bond ===");
        //     await withdrawBond(user1Keypair, bondId, user1ProfileId);
            
        //     // Show updated bond info
        //     await getBondInfo(bondId);
            
        //     /*
        //     // COMMENTED OUT: Breaking bond test - might fail if bond was never joined
        //     console.log("\n=== Test: Break Bond ===");
        //     await breakBond(user1Keypair, bondId, user1ProfileId);
            
        //     // Show final bond info
        //     await getBondInfo(bondId);
        //     */
        // }
        
        // console.log("\n=== Tests Completed Successfully ===");
        // console.log(`Profile ID: ${user1ProfileId}`);
        // console.log(`Test Bond ID: ${bondId}`);
        
    } catch (error) {
        console.error("Test failed:", error);
    }
}

const main = async () => {
    await runTests();
};

main().catch(console.error);