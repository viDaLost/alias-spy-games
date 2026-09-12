package com.watabou.pixeldungeon.admin;

import com.watabou.pixeldungeon.items.Amulet;
import com.watabou.pixeldungeon.items.Ankh;
import com.watabou.pixeldungeon.items.ArmorKit;
import com.watabou.pixeldungeon.items.Bomb;
import com.watabou.pixeldungeon.items.DewVial;
import com.watabou.pixeldungeon.items.Honeypot;
import com.watabou.pixeldungeon.items.LloydsBeacon;
import com.watabou.pixeldungeon.items.TomeOfMastery;
import com.watabou.pixeldungeon.items.Torch;
import com.watabou.pixeldungeon.items.Weightstone;
import com.watabou.pixeldungeon.items.armor.ClothArmor;
import com.watabou.pixeldungeon.items.armor.HuntressArmor;
import com.watabou.pixeldungeon.items.armor.LeatherArmor;
import com.watabou.pixeldungeon.items.armor.MageArmor;
import com.watabou.pixeldungeon.items.armor.MailArmor;
import com.watabou.pixeldungeon.items.armor.PlateArmor;
import com.watabou.pixeldungeon.items.armor.RogueArmor;
import com.watabou.pixeldungeon.items.armor.ScaleArmor;
import com.watabou.pixeldungeon.items.armor.WarriorArmor;
import com.watabou.pixeldungeon.items.bags.Keyring;
import com.watabou.pixeldungeon.items.bags.PotionBelt;
import com.watabou.pixeldungeon.items.bags.ScrollHolder;
import com.watabou.pixeldungeon.items.bags.SeedPouch;
import com.watabou.pixeldungeon.items.bags.WandHolster;
import com.watabou.pixeldungeon.items.keys.SkeletonKey;
import com.watabou.pixeldungeon.items.potions.PotionOfExperience;
import com.watabou.pixeldungeon.items.potions.PotionOfFrost;
import com.watabou.pixeldungeon.items.potions.PotionOfHealing;
import com.watabou.pixeldungeon.items.potions.PotionOfInvisibility;
import com.watabou.pixeldungeon.items.potions.PotionOfLevitation;
import com.watabou.pixeldungeon.items.potions.PotionOfLiquidFlame;
import com.watabou.pixeldungeon.items.potions.PotionOfMight;
import com.watabou.pixeldungeon.items.potions.PotionOfMindVision;
import com.watabou.pixeldungeon.items.potions.PotionOfParalyticGas;
import com.watabou.pixeldungeon.items.potions.PotionOfPurity;
import com.watabou.pixeldungeon.items.potions.PotionOfStrength;
import com.watabou.pixeldungeon.items.potions.PotionOfToxicGas;
import com.watabou.pixeldungeon.items.quest.DriedRose;
import com.watabou.pixeldungeon.items.quest.Pickaxe;
import com.watabou.pixeldungeon.items.rings.RingOfAccuracy;
import com.watabou.pixeldungeon.items.rings.RingOfDetection;
import com.watabou.pixeldungeon.items.rings.RingOfElements;
import com.watabou.pixeldungeon.items.rings.RingOfEvasion;
import com.watabou.pixeldungeon.items.rings.RingOfHaggler;
import com.watabou.pixeldungeon.items.rings.RingOfHaste;
import com.watabou.pixeldungeon.items.rings.RingOfHerbalism;
import com.watabou.pixeldungeon.items.rings.RingOfMending;
import com.watabou.pixeldungeon.items.rings.RingOfPower;
import com.watabou.pixeldungeon.items.rings.RingOfSatiety;
import com.watabou.pixeldungeon.items.rings.RingOfShadows;
import com.watabou.pixeldungeon.items.rings.RingOfThorns;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfChallenge;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfEnchantment;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfIdentify;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfLullaby;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfMagicMapping;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfMirrorImage;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfPsionicBlast;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfRecharging;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfRemoveCurse;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfTeleportation;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfTerror;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfUpgrade;
import com.watabou.pixeldungeon.items.scrolls.ScrollOfWipeOut;
import com.watabou.pixeldungeon.items.wands.WandOfAmok;
import com.watabou.pixeldungeon.items.wands.WandOfAvalanche;
import com.watabou.pixeldungeon.items.wands.WandOfBlink;
import com.watabou.pixeldungeon.items.wands.WandOfDisintegration;
import com.watabou.pixeldungeon.items.wands.WandOfFirebolt;
import com.watabou.pixeldungeon.items.wands.WandOfFlock;
import com.watabou.pixeldungeon.items.wands.WandOfLightning;
import com.watabou.pixeldungeon.items.wands.WandOfMagicMissile;
import com.watabou.pixeldungeon.items.wands.WandOfPoison;
import com.watabou.pixeldungeon.items.wands.WandOfReach;
import com.watabou.pixeldungeon.items.wands.WandOfRegrowth;
import com.watabou.pixeldungeon.items.wands.WandOfSlowness;
import com.watabou.pixeldungeon.items.wands.WandOfTeleportation;
import com.watabou.pixeldungeon.items.weapon.melee.BattleAxe;
import com.watabou.pixeldungeon.items.weapon.melee.Dagger;
import com.watabou.pixeldungeon.items.weapon.melee.Glaive;
import com.watabou.pixeldungeon.items.weapon.melee.Knuckles;
import com.watabou.pixeldungeon.items.weapon.melee.Longsword;
import com.watabou.pixeldungeon.items.weapon.melee.Mace;
import com.watabou.pixeldungeon.items.weapon.melee.Quarterstaff;
import com.watabou.pixeldungeon.items.weapon.melee.ShortSword;
import com.watabou.pixeldungeon.items.weapon.melee.Spear;
import com.watabou.pixeldungeon.items.weapon.melee.Sword;
import com.watabou.pixeldungeon.items.weapon.melee.WarHammer;
import com.watabou.pixeldungeon.items.weapon.missiles.Boomerang;
import com.watabou.pixeldungeon.items.weapon.missiles.CurareDart;
import com.watabou.pixeldungeon.items.weapon.missiles.Dart;
import com.watabou.pixeldungeon.items.weapon.missiles.IncendiaryDart;
import com.watabou.pixeldungeon.items.weapon.missiles.Javelin;
import com.watabou.pixeldungeon.items.weapon.missiles.Shuriken;
import com.watabou.pixeldungeon.items.weapon.missiles.Tamahawk;

/** Всё, что умеет выдавать админ-панель, разбитое по категориям. */
final class AdminCatalog {

	static final String[] CATEGORIES = {
		"ОРУЖИЕ", "МЕТАТЕЛЬНОЕ", "БРОНЯ", "ЖЕЗЛЫ", "КОЛЬЦА", "АРТЕФАКТЫ", "ЗЕЛЬЯ", "СВИТКИ"
	};

	private static final Class[] WEAPONS = {
		Knuckles.class, Dagger.class, ShortSword.class, Quarterstaff.class, Spear.class,
		Sword.class, Mace.class, Longsword.class, BattleAxe.class, Glaive.class, WarHammer.class
	};

	private static final Class[] MISSILES = {
		Dart.class, IncendiaryDart.class, CurareDart.class, Shuriken.class,
		Javelin.class, Tamahawk.class, Boomerang.class
	};

	private static final Class[] ARMOR = {
		ClothArmor.class, LeatherArmor.class, MailArmor.class, ScaleArmor.class, PlateArmor.class,
		WarriorArmor.class, MageArmor.class, RogueArmor.class, HuntressArmor.class
	};

	private static final Class[] WANDS = {
		WandOfMagicMissile.class, WandOfFirebolt.class, WandOfLightning.class, WandOfDisintegration.class,
		WandOfPoison.class, WandOfSlowness.class, WandOfAmok.class, WandOfBlink.class,
		WandOfTeleportation.class, WandOfAvalanche.class, WandOfFlock.class, WandOfReach.class,
		WandOfRegrowth.class
	};

	private static final Class[] RINGS = {
		RingOfPower.class, RingOfAccuracy.class, RingOfEvasion.class, RingOfHaste.class,
		RingOfMending.class, RingOfDetection.class, RingOfElements.class, RingOfShadows.class,
		RingOfSatiety.class, RingOfThorns.class, RingOfHaggler.class, RingOfHerbalism.class
	};

	private static final Class[] ARTIFACTS = {
		Amulet.class, TomeOfMastery.class, ArmorKit.class, Weightstone.class, LloydsBeacon.class,
		DewVial.class, Ankh.class, SkeletonKey.class, Pickaxe.class, DriedRose.class,
		Torch.class, Bomb.class, Honeypot.class,
		Keyring.class, SeedPouch.class, ScrollHolder.class, WandHolster.class, PotionBelt.class
	};

	private static final Class[] POTIONS = {
		PotionOfStrength.class, PotionOfMight.class, PotionOfHealing.class, PotionOfExperience.class,
		PotionOfMindVision.class, PotionOfInvisibility.class, PotionOfLevitation.class, PotionOfPurity.class,
		PotionOfFrost.class, PotionOfLiquidFlame.class, PotionOfToxicGas.class, PotionOfParalyticGas.class
	};

	private static final Class[] SCROLLS = {
		ScrollOfUpgrade.class, ScrollOfEnchantment.class, ScrollOfMagicMapping.class, ScrollOfIdentify.class,
		ScrollOfRemoveCurse.class, ScrollOfRecharging.class, ScrollOfMirrorImage.class, ScrollOfTeleportation.class,
		ScrollOfTerror.class, ScrollOfLullaby.class, ScrollOfChallenge.class, ScrollOfPsionicBlast.class,
		ScrollOfWipeOut.class
	};

	private static final Class[][] ALL = {
		WEAPONS, MISSILES, ARMOR, WANDS, RINGS, ARTIFACTS, POTIONS, SCROLLS
	};

	private AdminCatalog() {
	}

	static Class[] items( int category ) {
		return ALL[category];
	}
}
