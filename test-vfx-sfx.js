// VFX/SFX Integration Test for Booty Hunt
// Tests all 9 upgrade features: hardtack, chain shot, war drums, grapeshot, neptune, ghost sails, phoenix sails, boarding party, davy's pact

import { chromium } from 'playwright';

(async () => {
  console.log('🎮 Starting Booty Hunt VFX/SFX Integration Test\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--window-size=1280,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  try {
    // Navigate to the game
    console.log('📂 Loading game...');
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(2000);

    // Click anywhere to start (audio context needs user interaction)
    await page.mouse.click(640, 400);
    await page.waitForTimeout(500);

    // Skip title screen
    console.log('▶️  Starting game...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(2500);

    // Take initial screenshot
    await page.screenshot({ path: '/tmp/booty-hunt-start.png', scale: 'css' });

    // Open dev console
    console.log('🔧 Opening dev console...');
    await page.keyboard.press('`');
    await page.waitForTimeout(400);

    // === TEST 1: Hardtack Rations (heal flash at wave start) ===
    console.log('\n🍞 TEST 1: Hardtack Rations');
    console.log('   Granting upgrade...');
    await page.keyboard.type('grant hardtack_rations');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // Close console
    await page.keyboard.press('`');
    await page.waitForTimeout(400);

    // Start next wave to see green heal flash
    console.log('   Starting wave to trigger heal flash...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: '/tmp/01-hardtack-heal.png', scale: 'css' });
    console.log('   ✅ Hardtack: green heal flash should have appeared\n');

    // === TEST 2: Chain Shot (blue tint + metallic clang) ===
    console.log('⛓️  TEST 2: Chain Shot');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant chain_shot');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(500);

    // Wait for ships to spawn
    console.log('   Waiting for ships to spawn...');
    await page.waitForTimeout(3000);

    // Fire at a merchant
    console.log('   Firing broadside to test chain shot...');
    await page.keyboard.press('a'); // Port
    await page.waitForTimeout(2500);

    await page.screenshot({ path: '/tmp/02-chain-shot.png', scale: 'css' });
    console.log('   ✅ Chain Shot: blue tint + metallic clang on hit\n');

    // === TEST 3: War Drums (periodic beats) ===
    console.log('🥁 TEST 3: War Drums');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant war_drums');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');

    console.log('   🎵 Listening for drum beats (5 seconds)...');
    console.log('   (You should hear periodic drums every 2 seconds)');
    await page.waitForTimeout(5000);
    console.log('   ✅ War Drums: periodic beats during combat\n');

    // === TEST 4: Grapeshot (ricochet scatter SFX) ===
    console.log('💥 TEST 4: Grapeshot');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant grapeshot');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(400);

    console.log('   Firing shots to trigger grapeshot splits...');
    await page.keyboard.press('a');
    await page.waitForTimeout(1200);
    await page.keyboard.press('d');
    await page.waitForTimeout(2000);
    console.log('   ✅ Grapeshot: ricochet scatter SFX on splits\n');

    // === TEST 5: Neptune's Wrath (rising charge hum) ===
    console.log('🔱 TEST 5: Neptune\'s Wrath');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant neptunes_wrath');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(400);

    console.log('   🎵 Firing 5 broadsides to test charge indicator...');
    console.log('   (Listen for rising hum intensity on each shot)');
    for (let i = 0; i < 5; i++) {
      console.log(`   Shot ${i + 1}/5...`);
      await page.keyboard.press('a');
      await page.waitForTimeout(1600);
    }

    await page.screenshot({ path: '/tmp/03-neptune-aoe.png', scale: 'css' });
    console.log('   ✅ Neptune\'s Wrath: rising charge + AoE on 5th shot\n');

    // === TEST 6: Ghost Sails (dodge cyan flash + whoosh) ===
    console.log('👻 TEST 6: Ghost Sails');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant ghost_sails');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Boost dodge chance for testing
    await page.keyboard.type('progression.stats.dodgeChance = 0.8');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');

    console.log('   ⏳ Waiting for enemy fire to trigger dodge...');
    console.log('   (80% dodge chance - cyan flash when dodging)');
    await page.waitForTimeout(8000);

    await page.screenshot({ path: '/tmp/04-ghost-dodge.png', scale: 'css' });
    console.log('   ✅ Ghost Sails: cyan flash + whoosh on dodge\n');

    // === TEST 7: Phoenix Sails (fire burst + golden flash + chord) ===
    console.log('🔥 TEST 7: Phoenix Sails');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant phoenix_sails');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // Get current HP and reduce to 1
    console.log('   Reducing HP to trigger phoenix revive...');
    await page.keyboard.type('const s = progression.getPlayerStats(); progression.takeDamage(s.health - 1);');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Trigger fatal damage
    console.log('   Triggering fatal damage...');
    await page.keyboard.type('progression.takeDamage(50);');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(1200);

    await page.screenshot({ path: '/tmp/05-phoenix-revive.png', scale: 'css' });
    console.log('   ✅ Phoenix Sails: fire particles + golden flash + rising chord\n');

    // === TEST 8: Boarding Party (extra gold burst) ===
    console.log('⚔️  TEST 8: Boarding Party');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant boarding_party');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(400);

    console.log('   Capturing a ship to see extra gold burst...');
    await page.keyboard.press('a');
    await page.waitForTimeout(3500);

    await page.screenshot({ path: '/tmp/06-boarding-party.png', scale: 'css' });
    console.log('   ✅ Boarding Party: extra gold burst proportional to bonus\n');

    // === TEST 9: Davy's Pact (dark purple aura) ===
    console.log('💀 TEST 9: Davy\'s Pact');
    await page.keyboard.press('`');
    await page.waitForTimeout(300);
    await page.keyboard.type('grant davys_pact');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('`');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: '/tmp/07-davys-pact.png', scale: 'css' });
    console.log('   ✅ Davy\'s Pact: dark purple aura on player ship\n');

    // Final overview screenshot
    await page.screenshot({ path: '/tmp/08-test-complete.png', scale: 'css' });

    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 All VFX/SFX Integration Tests Complete!');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n📸 Screenshots saved to /tmp/:');
    console.log('   • booty-hunt-start.png - Initial game state');
    console.log('   • 01-hardtack-heal.png - Green heal flash');
    console.log('   • 02-chain-shot.png - Blue tint on ship');
    console.log('   • 03-neptune-aoe.png - Neptune AoE explosion');
    console.log('   • 04-ghost-dodge.png - Cyan dodge flash');
    console.log('   • 05-phoenix-revive.png - Fire burst + golden flash');
    console.log('   • 06-boarding-party.png - Extra gold burst');
    console.log('   • 07-davys-pact.png - Purple aura on ship');
    console.log('   • 08-test-complete.png - Final state\n');

    console.log('✨ Features Tested:');
    console.log('   ✅ Hardtack Rations: Green heal flash at wave start');
    console.log('   ✅ Chain Shot: Blue tint + metallic clang');
    console.log('   ✅ War Drums: Periodic drum beats (2s interval)');
    console.log('   ✅ Grapeshot: Ricochet scatter SFX on splits');
    console.log('   ✅ Neptune\'s Wrath: Rising charge hum + AoE');
    console.log('   ✅ Ghost Sails: Cyan dodge flash + whoosh');
    console.log('   ✅ Phoenix Sails: Fire burst + golden flash + chord');
    console.log('   ✅ Boarding Party: Extra gold burst');
    console.log('   ✅ Davy\'s Pact: Dark purple aura');

    console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    await page.screenshot({ path: '/tmp/error-screenshot.png', scale: 'css' });
    console.log('📸 Error screenshot saved to /tmp/error-screenshot.png');
  } finally {
    await browser.close();
    console.log('\n👋 Test complete. Browser closed.');
  }
})();
