import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { requestSuiFromFaucetV1 } from '@mysten/sui/faucet';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { SuiObjectChange } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: getFullnodeUrl('localnet') });
console.log("Connected to network:", suiClient.network);

// Replace with your package ID from sui client publish output
const PACKAGE_ID = '0xdd5a61ffa8344e6d06d0ddf4b0e58c12e7b4fd2bef1441e432c3f4591e05a091'; // TODO: Replace with actual package ID

// Generate test keypairs (use secure storage in production)
const user1KeypairData = new Uint8Array(32).fill(1);
const user2KeypairData = new Uint8Array(32).fill(2);
const user1Keypair = Ed25519Keypair.fromSecretKey(user1KeypairData);
const user2Keypair = Ed25519Keypair.fromSecretKey(user2KeypairData);

// Get addresses
const USER1_ADDRESS = user1Keypair.toSuiAddress();
const USER2_ADDRESS = user2Keypair.toSuiAddress();

console.log("User1 Address:", USER1_ADDRESS);
console.log("User2 Address:", USER2_ADDRESS);

// Helper to convert from MIST to SUI
const formatBalance = (balance: string | number): number => {
    return Number(balance) / Number(MIST_PER_SUI);
};

// Helper to get account balance
const getBalance = async (address: string): Promise<number> => {
    try {
        const balance = await suiClient.getBalance({
            owner: address,
        });
        return formatBalance(balance.totalBalance);
    } catch (error) {
        console.error(`Error fetching balance for ${address}:`, error);
        throw error;
    }
};

// Helper to request SUI from faucet
const requestSui = async (address: string): Promise<void> => {
    try {
        console.log(`Requesting SUI for ${address}...`);
        const response = await requestSuiFromFaucetV1({
            host: "http://127.0.0.1:9123",
            recipient: address,
        });
        console.log(`Faucet Response for ${address}:`, response);
        const balance = await getBalance(address);
        console.log(`New balance for ${address}: ${balance} SUI`);
    } catch (error) {
        console.error(`Faucet error for ${address}:`, error);
        throw error;
    }
};

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

// Function to create a trust profile
async function createTrustProfile(keypair: Ed25519Keypair, name: string): Promise<string> {
    console.log(`Creating trust profile for ${keypair.toSuiAddress()} with name "${name}"...`);
    const tx = new Transaction();

    const clock = tx.object('0x6');
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::create_trust_profile`,
        arguments: [
            tx.pure.string(name),
            clock,
        ],
    });
    const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });
    // Handle null case by converting it to undefined
    const profileId = findCreatedObjectId(result.objectChanges ?? undefined, '::trust::TrustProfile');
    if (!profileId) {
        throw new Error("Failed to create trust profile");
    }
    console.log(`Created trust profile with ID: ${profileId}`);
    return profileId;
}

//function to create a bond
async function createBond(
    fromKeypair: Ed25519Keypair,
    fromProfileId: string,
    toAddress: string,
    amount: number
): Promise<string> {
    console.log(`Creating bond from ${fromKeypair.toSuiAddress()} to ${toAddress} with ${amount} SUI...`);
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount * Number(MIST_PER_SUI))]);
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::create_bond`,
        arguments: [
            tx.object(fromProfileId),
            tx.pure.address(toAddress),
            coin,
            tx.object('0x6'), // Clock
        ],
    });
    const result = await suiClient.signAndExecuteTransaction({
        signer: fromKeypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });
    // Handle null case by converting it to undefined
    const bondId = findCreatedObjectId(result.objectChanges ?? undefined, '::trust::TrustBond');
    if (!bondId) {
        throw new Error("Failed to create bond");
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
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount * Number(MIST_PER_SUI))]);
    tx.moveCall({
        target: `${PACKAGE_ID}::trust::join_bond`,
        arguments: [
            tx.object(bondId),
            tx.object(profileId),
            coin,
            tx.object('0x6'), // Clock
        ],
    });
    await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    console.log(`Joined bond ${bondId}`);
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
    await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    console.log(`Withdrawn from bond ${bondId}`);
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
    await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });
    console.log(`Broken bond ${bondId}`);
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
        console.log("Bond object:", bond);
        if (bond.data?.content?.dataType !== 'moveObject') {
            throw new Error("Invalid bond object");
        }
        // Corrected type assertion for TrustBond fields
        const fields = bond.data.content.fields as {
            user_1: string;
            user_2: string;
            bond_type: string | number;
            bond_status: string | number;
            money_by_user_1: string | number;
            money_by_user_2: string | number;
            bond_amount?: string | number;
            created_at?: string | number;
            updated_at?: string | number;
            id?: { id: string };
        };
        console.log("Raw bond fields:", JSON.stringify(fields, null, 2));
        // Validate balance values
        if (fields.money_by_user_1 === undefined || fields.money_by_user_1 === null) {
            throw new Error(`Invalid money_by_user_1: ${fields.money_by_user_1}`);
        }
        if (fields.money_by_user_2 === undefined || fields.money_by_user_2 === null) {
            throw new Error(`Invalid money_by_user_2: ${fields.money_by_user_2}`);
        }
        const bondInfo = {
            user1: fields.user_1,
            user2: fields.user_2,
            bondType: Number(fields.bond_type),
            bondStatus: Number(fields.bond_status),
            moneyByUser1: formatBalance(fields.money_by_user_1),
            moneyByUser2: formatBalance(fields.money_by_user_2),
        };
        console.log("Bond info:", bondInfo);
        return bondInfo;
    } catch (error) {
        console.error(`Error getting bond info for ${bondId}:`, error);
        throw error;
    }
}



async function getTrustScore(profileId: string, retries = 3): Promise<number> {
    console.log(`Getting trust score for profile ${profileId}...`);
    
    let attempt = 0;
    while (attempt < retries) {
        try {
            const profile = await suiClient.getObject({
                id: profileId,
                options: { showContent: true },
            });
            
            // More detailed error logging
            if (!profile.data) {
                console.log(`Profile data not found, attempt ${attempt + 1}/${retries}`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                attempt++;
                continue;
            }
            
            if (profile.data.content?.dataType !== 'moveObject') {
                console.log(`Profile is not a Move object, attempt ${attempt + 1}/${retries}`);
                console.log("Received:", JSON.stringify(profile.data.content, null, 2));
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                attempt++;
                continue;
            }
            
            // Assert the type of fields to include trust_score
            const fields = profile.data.content.fields as { trust_score: string | number };
            const trustScore = Number(fields.trust_score);
            console.log(`Trust score for ${profileId}: ${trustScore}`);
            return trustScore;
        } catch (error) {
            console.error(`Error getting trust score for ${profileId}, attempt ${attempt + 1}/${retries}:`, error);
            if (attempt === retries - 1) throw error;
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempt++;
        }
    }
    
    throw new Error(`Failed to get trust score for ${profileId} after ${retries} attempts`);
}
// Main test function
async function runTests() {
    console.log("Starting trust contract tests...");
    try {
        // Request SUI from faucet for both users
        await requestSui(USER1_ADDRESS);
        await requestSui(USER2_ADDRESS);
        console.log("Waiting 10s for faucet to process...");
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Verify balances
        const user1Balance = await getBalance(USER1_ADDRESS);
        const user2Balance = await getBalance(USER2_ADDRESS);
        console.assert(user1Balance >= 5, `Expected user1 balance >= 5 SUI, got ${user1Balance}`);
        console.assert(user2Balance >= 5, `Expected user2 balance >= 5 SUI, got ${user2Balance}`);

        // Step 1: Create trust profiles
        console.log("\n=== Test: Create Trust Profiles ===");
        const user1ProfileId = await createTrustProfile(user1Keypair, "Alice");
        // Add delay to ensure profiles are properly created and indexed
        console.log("Waiting for profiles to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        const user2ProfileId = await createTrustProfile(user2Keypair, "Bob");

        // Add delay to ensure profiles are properly created and indexed
        console.log("Waiting for profiles to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify trust scores (initially 100)
        const user1InitialScore = await getTrustScore(user1ProfileId);
        // Add delay to ensure profiles are properly created and indexed
        console.log("Waiting for profiles to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        const user2InitialScore = await getTrustScore(user2ProfileId);
        console.assert(user1InitialScore === 100, `Expected initial score 100, got ${user1InitialScore}`);
        console.assert(user2InitialScore === 100, `Expected initial score 100, got ${user2InitialScore}`);

        // Step 2: Create a one-way bond
        console.log("\n=== Test: Create Bond ===");
        const bondAmount = 1; // 1 SUI
        const bondId = await createBond(user1Keypair, user1ProfileId, USER2_ADDRESS, bondAmount);


        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Verify bond
        const bondInfo1 = await getBondInfo(bondId);
        
        console.assert(bondInfo1.bondType === 0, `Expected bond type 0 (one-way), got ${bondInfo1.bondType}`);
        console.assert(bondInfo1.bondStatus === 0, `Expected bond status 0 (active), got ${bondInfo1.bondStatus}`);
        console.assert(bondInfo1.moneyByUser1 === bondAmount, `Expected user1 amount ${bondAmount}, got ${bondInfo1.moneyByUser1}`);
        console.assert(bondInfo1.moneyByUser2 === 0, `Expected user2 amount 0, got ${bondInfo1.moneyByUser2}`);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 3: Join the bond
        console.log("\n=== Test: Join Bond ===");
        const joinAmount = 2; // 2 SUI
        await joinBond(user2Keypair, bondId, user2ProfileId, joinAmount);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify bond updated
        const bondInfo2 = await getBondInfo(bondId);
        console.assert(bondInfo2.bondType === 1, `Expected bond type 1 (two-way), got ${bondInfo2.bondType}`);
        console.assert(bondInfo2.bondStatus === 0, `Expected bond status 0 (active), got ${bondInfo2.bondStatus}`);
        console.assert(bondInfo2.moneyByUser1 === bondAmount, `Expected user1 amount ${bondAmount}, got ${bondInfo2.moneyByUser1}`);
        console.assert(bondInfo2.moneyByUser2 === joinAmount, `Expected user2 amount ${joinAmount}, got ${bondInfo2.moneyByUser2}`);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check user2's trust score increased
        const user2ScoreAfterJoin = await getTrustScore(user2ProfileId);
        console.assert(user2ScoreAfterJoin === 110, `Expected trust score 110 after join, got ${user2ScoreAfterJoin}`);

        console.log("Waiting for trust score to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 4: Withdraw from bond (user1)
        console.log("\n=== Test: Withdraw Bond ===");
        await withdrawBond(user1Keypair, bondId, user1ProfileId);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify bond
        const bondInfo3 = await getBondInfo(bondId);
        console.assert(bondInfo3.bondType === 0, `Expected bond type 0 (one-way), got ${bondInfo3.bondType}`);
        console.assert(bondInfo3.bondStatus === 0, `Expected bond status 0 (active), got ${bondInfo3.bondStatus}`);
        console.assert(bondInfo3.moneyByUser1 === 0, `Expected user1 amount 0, got ${bondInfo3.moneyByUser1}`);
        console.assert(bondInfo3.moneyByUser2 === joinAmount, `Expected user2 amount ${joinAmount}, got ${bondInfo3.moneyByUser2}`);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 5: Create and break a bond
        console.log("\n=== Test: Break Bond ===");
        const newBondAmount = 1.5; // 1.5 SUI
        const newBondId = await createBond(user1Keypair, user1ProfileId, USER2_ADDRESS, newBondAmount);
        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        await joinBond(user2Keypair, newBondId, user2ProfileId, joinAmount);
        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        await breakBond(user2Keypair, newBondId, user2ProfileId);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify bond
        const bondInfo4 = await getBondInfo(newBondId);
        console.assert(bondInfo4.bondStatus === 2, `Expected bond status 2 (broken), got ${bondInfo4.bondStatus}`);
        console.assert(bondInfo4.moneyByUser1 === 0, `Expected user1 amount 0, got ${bondInfo4.moneyByUser1}`);
        console.assert(bondInfo4.moneyByUser2 === 0, `Expected user2 amount 0, got ${bondInfo4.moneyByUser2}`);

        console.log("Waiting for bond to be indexed...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check user2's trust score decreased
        const user2ScoreAfterBreak = await getTrustScore(user2ProfileId);
        console.assert(user2ScoreAfterBreak === 60, `Expected trust score 60 after break, got ${user2ScoreAfterBreak}`);

        console.log("\n=== All Tests Completed Successfully ===");
    } catch (error) {
        console.error("Test failed:", error);
    }
}

const main = async () => {
    await runTests();
};

main().catch(console.error);