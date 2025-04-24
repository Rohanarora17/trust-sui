// #[test_only]
// module trust::trust_tests {
//     use trust::trust::{Self, TrustProfile, TrustBond, create_signed_int};
//     use sui::test_scenario::{Self, Scenario};
//     use sui::clock::{Self, Clock};
//     use sui::coin::{Self, Coin};
//     use sui::sui::SUI;
//     use std::string;
//     use sui::test_utils::assert_eq;
//     use sui::object;
//     use sui::transfer;
//     use sui::tx_context;
    
//     // Test addresses
//     const USER1: address = @0xA;
//     const USER2: address = @0xB;
    
//     // Test constants
//     const BOND_AMOUNT_1: u64 = 100;
//     const BOND_AMOUNT_2: u64 = 200;
    
//     // Setup scenario with a clock
//     fun setup_scenario(): (Scenario, Clock) {
//         let scenario = test_scenario::begin(USER1);
//         let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
//         (scenario, clock)
//     }
    
//     // Test creating a trust profile
//     #[test]
//     fun test_create_trust_profile() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profile
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Verify profile was created
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             assert_eq(trust::get_trust_score(&profile), 100); // Initial score should be 100
//             assert_eq(profile.total_bonds, 0);
//             assert_eq(profile.active_bonds, 0);
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test creating a bond
//     #[test]
//     fun test_create_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profiles for User1 and User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create bond from User1 to User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         // Verify bond was created
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
            
//             // Check profile stats
//             assert_eq(profile.active_bonds, 1);
//             assert_eq(profile.money_in_active_bonds, BOND_AMOUNT_1);
            
//             test_scenario::return_to_address(USER1, profile);
            
//             // Verify bond object was shared and has correct data
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let (user1, user2, bond_type, bond_status, money1, money2) = trust::get_bond_info(&bond);
            
//             assert_eq(user1, USER1);
//             assert_eq(user2, USER2);
//             assert_eq(bond_type, 0); // One-way bond
//             assert_eq(bond_status, 0); // Active
//             assert_eq(money1, BOND_AMOUNT_1);
//             assert_eq(money2, 0);
            
//             test_scenario::return_shared(bond);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test joining a bond
//     #[test]
//     fun test_join_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profiles for User1 and User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create bond from User1 to User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         // User2 joins the bond
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_2, test_scenario::ctx(&mut scenario));
            
//             trust::join_bond(&mut bond, &mut profile, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER2, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // Verify bond was updated
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             // Check User2's profile
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             assert_eq(profile.active_bonds, 1);
//             assert_eq(profile.money_in_active_bonds, BOND_AMOUNT_2);
//             assert_eq(trust::get_trust_score(&profile), 110); // Should have increased trust score
//             test_scenario::return_to_address(USER2, profile);
            
//             // Verify bond object was updated
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let (user1, user2, bond_type, bond_status, money1, money2) = trust::get_bond_info(&bond);
            
//             assert_eq(user1, USER1);
//             assert_eq(user2, USER2);
//             assert_eq(bond_type, 1); // Two-way bond
//             assert_eq(bond_status, 0); // Active
//             assert_eq(money1, BOND_AMOUNT_1);
//             assert_eq(money2, BOND_AMOUNT_2);
            
//             test_scenario::return_shared(bond);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test withdrawing from a bond
//     #[test]
//     fun test_withdraw_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profiles for User1 and User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create and join bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_2, test_scenario::ctx(&mut scenario));
            
//             trust::join_bond(&mut bond, &mut profile, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER2, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // User1 withdraws from the bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
            
//             trust::withdraw_bond(&mut bond, &mut profile, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // Verify bond was updated
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             // Check User1's profile
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             assert_eq(profile.active_bonds, 0);
//             assert_eq(profile.withdrawn_bonds, 1);
//             assert_eq(profile.money_in_active_bonds, 0);
//             assert_eq(profile.money_in_withdrawn_bonds, BOND_AMOUNT_1);
//             test_scenario::return_to_address(USER1, profile);
            
//             // Verify bond object was updated
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let (user1, user2, bond_type, bond_status, money1, money2) = trust::get_bond_info(&bond);
            
//             assert_eq(user1, USER1);
//             assert_eq(user2, USER2);
//             assert_eq(bond_type, 0); // Back to one-way bond
//             assert_eq(bond_status, 0); // Still active for User2
//             assert_eq(money1, 0);
//             assert_eq(money2, BOND_AMOUNT_2);
            
//             test_scenario::return_shared(bond);
            
//             // Verify User1 received their coin back
//             let coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, USER1);
//             assert_eq(coin::value(&coin), BOND_AMOUNT_1);
//             test_scenario::return_to_address(USER1, coin);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test breaking a bond
//     #[test]
//     fun test_break_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profiles for User1 and User2
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create and join bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_2, test_scenario::ctx(&mut scenario));
            
//             trust::join_bond(&mut bond, &mut profile, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER2, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // User1 breaks the bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
            
//             trust::break_bond(&mut bond, &mut profile, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // Verify bond was updated
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             // Check User1's profile
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             assert_eq(profile.active_bonds, 0);
//             assert_eq(profile.broken_bonds, 1);
//             assert_eq(profile.money_in_active_bonds, 0);
//             assert_eq(profile.money_in_broken_bonds, BOND_AMOUNT_1 + BOND_AMOUNT_2);
//             assert_eq(trust::get_trust_score(&profile), 50); // Should have decreased trust score
//             test_scenario::return_to_address(USER1, profile);
            
//             // Verify bond object was updated
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
//             let (user1, user2, bond_type, bond_status, money1, money2) = trust::get_bond_info(&bond);
            
//             assert_eq(user1, USER1);
//             assert_eq(user2, USER2);
//             assert_eq(bond_status, 2); // Broken
//             assert_eq(money1, 0);
//             assert_eq(money2, 0);
            
//             test_scenario::return_shared(bond);
            
//             // Verify User1 received all the coins
//             let coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, USER1);
//             assert_eq(coin::value(&coin), BOND_AMOUNT_1 + BOND_AMOUNT_2);
//             test_scenario::return_to_address(USER1, coin);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test the trust score penalty mechanism for bond breaking
//     #[test]
//     fun test_trust_score_penalty() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profiles
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create one-way bond (USER1 -> USER2)
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         // USER2 breaks the bond (stealing USER1's money)
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
            
//             // Before breaking
//             let initial_score = trust::get_trust_score(&profile);
            
//             trust::break_bond(&mut bond, &mut profile, &clock, test_scenario::ctx(&mut scenario));
            
//             // After breaking
//             let final_score = trust::get_trust_score(&profile);
            
//             // Should have a significant trust score penalty for stealing money
//             assert_eq(final_score, if (initial_score > 50) { initial_score - 50 } else { 0 });
            
//             test_scenario::return_to_address(USER2, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test attempting to join your own bond (should fail)
//     #[test]
//     #[expected_failure(abort_code = trust::trust::ECannotJoinOwnBond)]
//     fun test_join_own_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Create profile
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
            
//             // Try to create bond with self - should fail
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
            
//             // This should abort with ECannotJoinOwnBond
//             trust::create_bond(&mut profile, USER1, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
    
//     // Test attempting to withdraw from an inactive bond (should fail)
//     #[test]
//     #[expected_failure(abort_code = trust::trust::EBondNotActive)]
//     fun test_withdraw_inactive_bond() {
//         let (mut scenario, clock) = setup_scenario();
        
//         // Setup users and bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             trust::create_trust_profile(string::utf8(b"User 1"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             trust::create_trust_profile(string::utf8(b"User 2"), &clock, test_scenario::ctx(&mut scenario));
//         };
        
//         // Create bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let coin = coin::mint_for_testing<SUI>(BOND_AMOUNT_1, test_scenario::ctx(&mut scenario));
            
//             trust::create_bond(&mut profile, USER2, coin, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//         };
        
//         // User1 breaks the bond
//         test_scenario::next_tx(&mut scenario, USER1);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER1);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
            
//             trust::break_bond(&mut bond, &mut profile, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER1, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         // User2 tries to withdraw from broken bond (should fail)
//         test_scenario::next_tx(&mut scenario, USER2);
//         {
//             let profile = test_scenario::take_from_address<TrustProfile>(&scenario, USER2);
//             let bond = test_scenario::take_shared<TrustBond>(&scenario);
            
//             // This should abort with EBondNotActive
//             trust::withdraw_bond(&mut bond, &mut profile, &clock, test_scenario::ctx(&mut scenario));
            
//             test_scenario::return_to_address(USER2, profile);
//             test_scenario::return_shared(bond);
//         };
        
//         clock::destroy_for_testing(clock);
//         test_scenario::end(scenario);
//     }
// }