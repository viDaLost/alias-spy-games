package com.watabou.pixeldungeon.admin;

/**
 * Каталог всех предметов игры. Файл собирается скриптом build/gencatalog.py
 * по дизассемблированному коду, поэтому в списке оказывается каждый предмет,
 * который игра вообще умеет создавать.
 */
final class AdminCatalog {

	static final String[] CATEGORIES = {
		"ОРУЖИЕ", "МЕТАТЕЛЬНОЕ", "БРОНЯ", "ЖЕЗЛЫ", "КОЛЬЦА", "ЗЕЛЬЯ", "СВИТКИ", "СЕМЕНА", "ЕДА", "КЛЮЧИ", "КВЕСТОВЫЕ", "СУМКИ", "ПРОЧЕЕ"
	};

	private static final String[] C0 = {   // ОРУЖИЕ
		"com.watabou.pixeldungeon.items.weapon.melee.BattleAxe",
		"com.watabou.pixeldungeon.items.weapon.melee.Dagger",
		"com.watabou.pixeldungeon.items.weapon.melee.Glaive",
		"com.watabou.pixeldungeon.items.weapon.melee.Knuckles",
		"com.watabou.pixeldungeon.items.weapon.melee.Longsword",
		"com.watabou.pixeldungeon.items.weapon.melee.Mace",
		"com.watabou.pixeldungeon.items.weapon.melee.Quarterstaff",
		"com.watabou.pixeldungeon.items.weapon.melee.ShortSword",
		"com.watabou.pixeldungeon.items.weapon.melee.Spear",
		"com.watabou.pixeldungeon.items.weapon.melee.Sword",
		"com.watabou.pixeldungeon.items.weapon.melee.WarHammer",
	};

	private static final String[] C1 = {   // МЕТАТЕЛЬНОЕ
		"com.watabou.pixeldungeon.items.weapon.missiles.Boomerang",
		"com.watabou.pixeldungeon.items.weapon.missiles.CurareDart",
		"com.watabou.pixeldungeon.items.weapon.missiles.Dart",
		"com.watabou.pixeldungeon.items.weapon.missiles.IncendiaryDart",
		"com.watabou.pixeldungeon.items.weapon.missiles.Javelin",
		"com.watabou.pixeldungeon.items.weapon.missiles.Shuriken",
		"com.watabou.pixeldungeon.items.weapon.missiles.Tamahawk",
	};

	private static final String[] C2 = {   // БРОНЯ
		"com.watabou.pixeldungeon.items.armor.ClothArmor",
		"com.watabou.pixeldungeon.items.armor.HuntressArmor",
		"com.watabou.pixeldungeon.items.armor.LeatherArmor",
		"com.watabou.pixeldungeon.items.armor.MageArmor",
		"com.watabou.pixeldungeon.items.armor.MailArmor",
		"com.watabou.pixeldungeon.items.armor.PlateArmor",
		"com.watabou.pixeldungeon.items.armor.RogueArmor",
		"com.watabou.pixeldungeon.items.armor.ScaleArmor",
		"com.watabou.pixeldungeon.items.armor.WarriorArmor",
	};

	private static final String[] C3 = {   // ЖЕЗЛЫ
		"com.watabou.pixeldungeon.items.wands.WandOfAmok",
		"com.watabou.pixeldungeon.items.wands.WandOfAvalanche",
		"com.watabou.pixeldungeon.items.wands.WandOfBlink",
		"com.watabou.pixeldungeon.items.wands.WandOfDisintegration",
		"com.watabou.pixeldungeon.items.wands.WandOfFirebolt",
		"com.watabou.pixeldungeon.items.wands.WandOfFlock",
		"com.watabou.pixeldungeon.items.wands.WandOfLightning",
		"com.watabou.pixeldungeon.items.wands.WandOfMagicMissile",
		"com.watabou.pixeldungeon.items.wands.WandOfPoison",
		"com.watabou.pixeldungeon.items.wands.WandOfReach",
		"com.watabou.pixeldungeon.items.wands.WandOfRegrowth",
		"com.watabou.pixeldungeon.items.wands.WandOfSlowness",
		"com.watabou.pixeldungeon.items.wands.WandOfTeleportation",
	};

	private static final String[] C4 = {   // КОЛЬЦА
		"com.watabou.pixeldungeon.items.rings.RingOfAccuracy",
		"com.watabou.pixeldungeon.items.rings.RingOfDetection",
		"com.watabou.pixeldungeon.items.rings.RingOfElements",
		"com.watabou.pixeldungeon.items.rings.RingOfEvasion",
		"com.watabou.pixeldungeon.items.rings.RingOfHaggler",
		"com.watabou.pixeldungeon.items.rings.RingOfHaste",
		"com.watabou.pixeldungeon.items.rings.RingOfHerbalism",
		"com.watabou.pixeldungeon.items.rings.RingOfMending",
		"com.watabou.pixeldungeon.items.rings.RingOfPower",
		"com.watabou.pixeldungeon.items.rings.RingOfSatiety",
		"com.watabou.pixeldungeon.items.rings.RingOfShadows",
		"com.watabou.pixeldungeon.items.rings.RingOfThorns",
	};

	private static final String[] C5 = {   // ЗЕЛЬЯ
		"com.watabou.pixeldungeon.items.potions.PotionOfExperience",
		"com.watabou.pixeldungeon.items.potions.PotionOfFrost",
		"com.watabou.pixeldungeon.items.potions.PotionOfHealing",
		"com.watabou.pixeldungeon.items.potions.PotionOfInvisibility",
		"com.watabou.pixeldungeon.items.potions.PotionOfLevitation",
		"com.watabou.pixeldungeon.items.potions.PotionOfLiquidFlame",
		"com.watabou.pixeldungeon.items.potions.PotionOfMight",
		"com.watabou.pixeldungeon.items.potions.PotionOfMindVision",
		"com.watabou.pixeldungeon.items.potions.PotionOfParalyticGas",
		"com.watabou.pixeldungeon.items.potions.PotionOfPurity",
		"com.watabou.pixeldungeon.items.potions.PotionOfStrength",
		"com.watabou.pixeldungeon.items.potions.PotionOfToxicGas",
	};

	private static final String[] C6 = {   // СВИТКИ
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfChallenge",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfEnchantment",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfIdentify",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfLullaby",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfMagicMapping",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfMirrorImage",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfPsionicBlast",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfRecharging",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfRemoveCurse",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfTeleportation",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfTerror",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfUpgrade",
		"com.watabou.pixeldungeon.items.scrolls.ScrollOfWipeOut",
	};

	private static final String[] C7 = {   // СЕМЕНА
		"com.watabou.pixeldungeon.plants.Dreamweed$Seed",
		"com.watabou.pixeldungeon.plants.Earthroot$Seed",
		"com.watabou.pixeldungeon.plants.Fadeleaf$Seed",
		"com.watabou.pixeldungeon.plants.Firebloom$Seed",
		"com.watabou.pixeldungeon.plants.Icecap$Seed",
		"com.watabou.pixeldungeon.plants.Rotberry$Seed",
		"com.watabou.pixeldungeon.plants.Sorrowmoss$Seed",
		"com.watabou.pixeldungeon.plants.Sungrass$Seed",
	};

	private static final String[] C8 = {   // ЕДА
		"com.watabou.pixeldungeon.items.food.ChargrilledMeat",
		"com.watabou.pixeldungeon.items.food.FrozenCarpaccio",
		"com.watabou.pixeldungeon.items.food.MysteryMeat",
		"com.watabou.pixeldungeon.items.food.OverpricedRation",
		"com.watabou.pixeldungeon.items.food.Pasty",
	};

	private static final String[] C9 = {   // КЛЮЧИ
		"com.watabou.pixeldungeon.items.keys.GoldenKey",
		"com.watabou.pixeldungeon.items.keys.IronKey",
		"com.watabou.pixeldungeon.items.keys.SkeletonKey",
	};

	private static final String[] C10 = {   // КВЕСТОВЫЕ
		"com.watabou.pixeldungeon.items.quest.CorpseDust",
		"com.watabou.pixeldungeon.items.quest.DarkGold",
		"com.watabou.pixeldungeon.items.quest.DriedRose",
		"com.watabou.pixeldungeon.items.quest.DwarfToken",
		"com.watabou.pixeldungeon.items.quest.PhantomFish",
		"com.watabou.pixeldungeon.items.quest.Pickaxe",
		"com.watabou.pixeldungeon.items.quest.RatSkull",
	};

	private static final String[] C11 = {   // СУМКИ
		"com.watabou.pixeldungeon.items.bags.Keyring",
		"com.watabou.pixeldungeon.items.bags.PotionBelt",
		"com.watabou.pixeldungeon.items.bags.ScrollHolder",
		"com.watabou.pixeldungeon.items.bags.SeedPouch",
		"com.watabou.pixeldungeon.items.bags.WandHolster",
	};

	private static final String[] C12 = {   // ПРОЧЕЕ
		"com.watabou.pixeldungeon.items.Amulet",
		"com.watabou.pixeldungeon.items.Ankh",
		"com.watabou.pixeldungeon.items.ArmorKit",
		"com.watabou.pixeldungeon.items.Bomb",
		"com.watabou.pixeldungeon.items.DewVial",
		"com.watabou.pixeldungeon.items.Dewdrop",
		"com.watabou.pixeldungeon.items.Gold",
		"com.watabou.pixeldungeon.items.Honeypot",
		"com.watabou.pixeldungeon.items.LloydsBeacon",
		"com.watabou.pixeldungeon.items.TomeOfMastery",
		"com.watabou.pixeldungeon.items.Torch",
		"com.watabou.pixeldungeon.items.Weightstone",
	};

	private static final String[][] ALL = {
		C0, C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12
	};

	private AdminCatalog() {
	}

	static String[] items( int category ) {
		return ALL[category];
	}
}
