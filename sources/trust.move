module trust::trust {
    use std::string::String;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
   

    use suins::{ 
        suins::SuiNS,
        registry::Registry,
        domain
    };
    use suins::suins::registry;
    use suins::suins;
    use std::option::{Self, Option};

    // Error constants
    const ENotBondCreator: u64 = 0;
    const ENotBondParticipant: u64 = 1;
    const EBondAlreadyJoined: u64 = 2;
    const EBondNotActive: u64 = 3;
    const EInsufficientFunds: u64 = 4;
    const ECannotJoinOwnBond: u64 = 5;
    const ENotParticipant: u64 = 6;
    const ENameNotFound: u64 = 7;
    const ENameNotPointingToAddress: u64 = 8;
    const ENameExpired: u64 = 9;
    const EBlobNotCertified: u64 = 10;
    const EInsufficientStorage: u64 = 11;
    const EProfileAlreadyExists: u64 = 12;
    const EInvalidDomain: u64 = 13;
    const EProfileNotFound: u64 = 14;
    const MIN_STORAGE_EPOCHS: u32 = 100; // Minimum storage duration (e.g., 100 epochs)

    // Events
    public struct ProfileCreated has copy, drop {
        profile_id: object::ID,
        owner: address,
        name: String
    }

    public struct BondCreated has copy, drop {
        bond_id: object::ID,
        user_1: address,
        user_2: address,
        amount: u64
    }

    public struct BondJoined has copy, drop {
        bond_id: object::ID,
        user_2: address,
        amount: u64
    }

    public struct BondWithdrawn has copy, drop {
        bond_id: object::ID,
        user: address,
        amount: u64
    }

    public struct BondBroken has copy, drop {
        bond_id: object::ID,
        user: address,
        amount_taken: u64
    }

    // Registry to track which addresses have profiles
    public struct ProfileRegistry has key {
        id: UID,
        profiles: Table<address, ID>,  // Map of address to profile ID
    }

    public struct TrustProfile has key, store {
        id: UID,
        name: String,
        total_bonds: u64,
        active_bonds: u64,
        withdrawn_bonds: u64,
        broken_bonds: u64,
        money_in_active_bonds: u64,
        money_in_withdrawn_bonds: u64,
        money_in_broken_bonds: u64,
        trust_score: u64,
        created_at: u64,
        updated_at: u64,
    }

    public struct TrustBond has key, store {
        id: UID,
        user_1: address,
        user_2: address,
        bond_amount: u64,
        bond_type: u8, // 0: one way, 1: two way
        bond_status: u8, // 0: active, 1: withdrawn, 2: broken
        money_by_user_1: Balance<SUI>,
        money_by_user_2: Balance<SUI>,
        created_at: u64,
        updated_at: u64,
    }

    // Initialize the registry
    fun init(ctx: &mut TxContext) {
        let registry = ProfileRegistry {
            id: object::new(ctx),
            profiles: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // Create a trust profile for a new user
    public entry fun create_trust_profile(
        registry: &mut ProfileRegistry,
        name: String,
        should_verify_domain: bool,
        suins: &SuiNS,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Check if profile already exists for this address
        assert!(!table::contains(&registry.profiles, sender), EProfileAlreadyExists);
        
        // If should_verify_domain is true, verify the domain
        if (should_verify_domain) {
            let is_valid = verify_domain(name, suins, clock, ctx);
            assert!(is_valid, EInvalidDomain);
        };
        
        let profile_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&profile_id);
        
        let profile = TrustProfile {
            id: profile_id,
            name,
            total_bonds: 0,
            active_bonds: 0,
            withdrawn_bonds: 0,
            broken_bonds: 0,
            money_in_active_bonds: 0,
            money_in_withdrawn_bonds: 0,
            money_in_broken_bonds: 0,
            trust_score: 100, // Initial score; start with a neutral score
            created_at: clock::timestamp_ms(clock),
            updated_at: clock::timestamp_ms(clock),
        };
        
        // Register the profile in the registry
        table::add(&mut registry.profiles, sender, id_copy);
        
        // Emit event
        event::emit(ProfileCreated {
            profile_id: id_copy,
            owner: sender,
            name
        });
        
        transfer::transfer(profile, sender);
    }
     
    // SignedInt struct for representing signed integers
    public struct SignedInt has drop{
        magnitude: u64,
        is_negative: bool,
    }

    // Constructor for SignedInt
    public fun create_signed_int(magnitude: u64, is_negative: bool): SignedInt {
        SignedInt { magnitude, is_negative }
    }

    // Apply a SignedInt to a u64 value with underflow protection
    public fun apply_delta(value: u64, delta: SignedInt): u64 {
        if (delta.is_negative) {
            // For negative delta, subtract from value with underflow protection
            if (value >= delta.magnitude) {
                value - delta.magnitude 
            } else {
                0 // Floor at 0 to prevent underflow
            }
        } else {
            // For positive delta, add to value
            value + delta.magnitude
        }
    }
    // Check if a user has a trust profile
    public fun has_trust_profile(
        registry: &ProfileRegistry,
        user_address: address
    ): bool {
        table::contains(&registry.profiles, user_address)
    }

    // Get the trust profile ID for a user
    public fun get_profile_id(
        registry: &ProfileRegistry,
        user_address: address
    ): ID {
        assert!(table::contains(&registry.profiles, user_address), EProfileNotFound);
        *table::borrow(&registry.profiles, user_address)
    }


    // Comprehensive function to get all profile data in one call
    public fun get_profile_data(profile: &TrustProfile): (
        String,  // name
        u64,     // total_bonds
        u64,     // active_bonds
        u64,     // withdrawn_bonds
        u64,     // broken_bonds
        u64,     // money_in_active_bonds
        u64,     // money_in_withdrawn_bonds
        u64,     // money_in_broken_bonds
        u64,     // trust_score
        u64,     // created_at
        u64      // updated_at
    ) {
        (
            profile.name,
            profile.total_bonds,
            profile.active_bonds,
            profile.withdrawn_bonds,
            profile.broken_bonds,
            profile.money_in_active_bonds,
            profile.money_in_withdrawn_bonds,
            profile.money_in_broken_bonds,
            profile.trust_score,
            profile.created_at,
            profile.updated_at
        )
    }
    
    // Internal function to update a trust profile
    fun update_profile(
        profile: &mut TrustProfile,
        active_bonds_delta: SignedInt,
        withdrawn_bonds_delta: SignedInt,
        broken_bonds_delta: SignedInt,
        active_money_delta: SignedInt,
        withdrawn_money_delta: SignedInt,
        broken_money_delta: SignedInt,
        trust_score_delta: SignedInt,
        clock: &Clock
    ) {
        // Update bond counts with delta application
        profile.active_bonds = apply_delta(profile.active_bonds, active_bonds_delta);
        profile.withdrawn_bonds = apply_delta(profile.withdrawn_bonds, withdrawn_bonds_delta);
        profile.broken_bonds = apply_delta(profile.broken_bonds, broken_bonds_delta);
        
        // Update money counts with delta application
        profile.money_in_active_bonds = apply_delta(profile.money_in_active_bonds, active_money_delta);
        profile.money_in_withdrawn_bonds = apply_delta(profile.money_in_withdrawn_bonds, withdrawn_money_delta);
        profile.money_in_broken_bonds = apply_delta(profile.money_in_broken_bonds, broken_money_delta);
        
        // Update total bonds
        profile.total_bonds = profile.active_bonds + profile.withdrawn_bonds + profile.broken_bonds;
        
        // Trust score calculation with delta application
        profile.trust_score = apply_delta(profile.trust_score, trust_score_delta);
        
        // Update timestamp
        profile.updated_at = clock::timestamp_ms(clock);
    }

    // Create a new bond with another user
    public entry fun create_bond(
        recipient_profile: &mut TrustProfile,
        user_2: address,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender != user_2, ECannotJoinOwnBond);
        
        let amount = coin::value(&payment);
        let bond_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&bond_id);
        
        // Create bond with payment
        let payment_balance = coin::into_balance(payment);
        
        let bond = TrustBond {
            id: bond_id,
            user_1: sender,
            user_2,
            bond_amount: amount,
            bond_type: 0, // One-way initially
            bond_status: 0, // Active
            money_by_user_1: payment_balance,
            money_by_user_2: balance::zero(),
            created_at: clock::timestamp_ms(clock),
            updated_at: clock::timestamp_ms(clock),
        };
        
        // Update sender's profile
        update_profile(
            recipient_profile,
            create_signed_int(1, false), // +1 active bond
            create_signed_int(0, false), // No change to withdrawn bonds
            create_signed_int(0, false), // No change to broken bonds
            create_signed_int(amount, false), // Add money to active bonds
            create_signed_int(0, false), // No change to withdrawn bond money
            create_signed_int(0, false), // No change to broken bond money
            create_signed_int(0, false), // No change to trust score yet
            clock
        );
        
        // Emit event
        event::emit(BondCreated {
            bond_id: id_copy,
            user_1: sender,
            user_2,
            amount
        });
        
        // Transfer bond object to sender
        transfer::share_object(bond);
    }

    // Join an existing bond by adding funds
    public entry fun join_bond(
        bond: &mut TrustBond,
        sender_profile: &mut TrustProfile,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Verify sender is the intended recipient of the bond
        assert!(sender == bond.user_2, ENotBondParticipant);
        
        // Verify bond is active
        assert!(bond.bond_status == 0, EBondNotActive);
        
        // Verify bond is not already joined
        assert!(bond.bond_type == 0, EBondAlreadyJoined);
        
        let amount = coin::value(&payment);
        let payment_balance = coin::into_balance(payment);
        
        // Update bond
        bond.bond_type = 1; // Two-way
        balance::join(&mut bond.money_by_user_2, payment_balance);
        bond.updated_at = clock::timestamp_ms(clock);
        
        // Update sender's profile
        update_profile(
            sender_profile,
            create_signed_int(1, false), // +1 active bond
            create_signed_int(0, false), // No change to withdrawn bonds
            create_signed_int(0, false), // No change to broken bonds
            create_signed_int(amount, false), // Add money to active bonds
            create_signed_int(0, false), // No change to withdrawn bond money
            create_signed_int(0, false), // No change to broken bond money
            create_signed_int(10, false), // Increase trust score for joining bond
            clock
        );
        
        // Emit event
        event::emit(BondJoined {
            bond_id: object::uid_to_inner(&bond.id),
            user_2: sender,
            amount
        });
    }

    // Withdraw funds from a bond
    public entry fun withdraw_bond(
        bond: &mut TrustBond,
        profile: &mut TrustProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(bond.bond_status == 0, EBondNotActive);
        assert!(tx_context::sender(ctx) == bond.user_1 || tx_context::sender(ctx) == bond.user_2, ENotParticipant);
        
        let sender = tx_context::sender(ctx);
        let withdrawn_amount = if (sender == bond.user_1) {
            balance::value(&bond.money_by_user_1)
        } else {
            balance::value(&bond.money_by_user_2)
        };
        
        if (sender == bond.user_1) {
            let balance = balance::withdraw_all(&mut bond.money_by_user_1);
            let coin = coin::from_balance(balance, ctx);
            transfer::public_transfer(coin, sender);
        } else {
            let balance = balance::withdraw_all(&mut bond.money_by_user_2);
            let coin = coin::from_balance(balance, ctx);
            transfer::public_transfer(coin, sender);
        };
        
        // Update bond_type based on remaining balances
        bond.bond_type = if (balance::value(&bond.money_by_user_1) == 0 && balance::value(&bond.money_by_user_2) > 0) {
            0 // One-way (user2 only)
        } else if (balance::value(&bond.money_by_user_2) == 0 && balance::value(&bond.money_by_user_1) > 0) {
            0 // One-way (user1 only)
        } else if (balance::value(&bond.money_by_user_1) > 0 && balance::value(&bond.money_by_user_2) > 0) {
            1 // Two-way
        } else {
            0 // No contributions (optional, depending on your logic)
        };
        
        bond.updated_at = clock::timestamp_ms(clock);
    }

    // Break a bond (take all funds, including the other person's)
    public entry fun break_bond(
        bond: &mut TrustBond,
        profile: &mut TrustProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Verify bond is active
        assert!(bond.bond_status == 0, EBondNotActive);
        
        // Verify sender is part of the bond
        assert!(sender == bond.user_1 || sender == bond.user_2, ENotBondParticipant);
        
        let user1_amount = balance::value(&bond.money_by_user_1);
        let user2_amount = balance::value(&bond.money_by_user_2);
        let total_amount = user1_amount + user2_amount;
        
        // Handle user1's balance
        if (user1_amount > 0) {
            let withdrawn1 = balance::withdraw_all(&mut bond.money_by_user_1);
            if (sender == bond.user_1) {
                balance::join(&mut bond.money_by_user_1, withdrawn1);
            } else {
                balance::join(&mut bond.money_by_user_2, withdrawn1);
            };
        };

        // Handle user2's balance
        if (user2_amount > 0) {
            let withdrawn2 = balance::withdraw_all(&mut bond.money_by_user_2);
            if (sender == bond.user_1) {
                balance::join(&mut bond.money_by_user_1, withdrawn2);
            } else {
                balance::join(&mut bond.money_by_user_2, withdrawn2);
            };
        };
        
        let coin_to_transfer;
        if (sender == bond.user_1) {
            coin_to_transfer = coin::from_balance(balance::withdraw_all(&mut bond.money_by_user_1), ctx);
        } else {
            coin_to_transfer = coin::from_balance(balance::withdraw_all(&mut bond.money_by_user_2), ctx);
        };
        
        transfer::public_transfer(coin_to_transfer, sender);
        
        // Mark bond as broken
        bond.bond_status = 2; // Broken
        bond.updated_at = clock::timestamp_ms(clock);
        
        // Determine how much was stolen
        let stolen_amount = if (sender == bond.user_1) { user2_amount } else { user1_amount };
        
        // Update profile - severe trust penalty for breaking bond
        update_profile(
            profile,
            create_signed_int(1, true), // -1 active bond
            create_signed_int(0, false), // No change to withdrawn bonds
            create_signed_int(1, false), // +1 broken bond
            create_signed_int(total_amount, true), // Remove money from active bonds
            create_signed_int(0, false), // No change to withdrawn bond money
            create_signed_int(total_amount, false), // Add money to broken bonds
            create_signed_int(50, true), // Trust penalty, higher if they took money
            clock
        );
        
        // Emit event
        event::emit(BondBroken {
            bond_id: object::uid_to_inner(&bond.id),
            user: sender,
            amount_taken: total_amount
        });
    }

    // Get user's trust score from their profile
    public fun get_trust_score(profile: &TrustProfile): u64 {
        profile.trust_score
    }
    
    // Get bond information
    public fun get_bond_info(bond: &TrustBond): (address, address, u8, u8, u64, u64) {
        (
            bond.user_1,
            bond.user_2,
            bond.bond_type,
            bond.bond_status,
            balance::value(&bond.money_by_user_1),
            balance::value(&bond.money_by_user_2)
        )
    }

    public fun verify_domain(
        name: String,           // The .sui domain name (e.g., "alice.sui")
        suins: &SuiNS,          // Reference to SuiNS for domain lookup
        clock: &Clock,          // Clock for timestamp checks
        ctx: &TxContext         // Transaction context to get the signer
    ): bool {
        let sender = tx_context::sender(ctx);

        // Create a domain object from the provided name
        let domain = domain::new(name);

        // We need to follow the original method call pattern exactly
        // This suggests sui_ns uses dot notation method calls in its API
        let registry = suins.registry<Registry>();
        let mut optional = registry.lookup(domain);
        
        // Check if domain exists
        if (optional.is_none()) {
            return false
        };

        let name_record = optional.extract();

        // Check if domain points to sender's address
        if (!name_record.target_address().is_some() || 
            name_record.target_address().extract() != sender) {
            return false
        };

        // Check if domain is expired (note: original had this logic reversed)
        if (name_record.has_expired(clock)) {
            return false
        };

        true // Return true if all checks pass
    }
}