package com.watabou.pixeldungeon.admin;

import com.watabou.pixeldungeon.Dungeon;
import com.watabou.pixeldungeon.actors.hero.Hero;
import com.watabou.pixeldungeon.items.Heap;
import com.watabou.pixeldungeon.items.Item;
import com.watabou.pixeldungeon.items.armor.Armor;
import com.watabou.pixeldungeon.items.rings.Ring;
import com.watabou.pixeldungeon.items.wands.Wand;
import com.watabou.pixeldungeon.items.weapon.Weapon;
import com.watabou.pixeldungeon.levels.Level;
import com.watabou.pixeldungeon.levels.Terrain;
import com.watabou.pixeldungeon.scenes.GameScene;
import com.watabou.pixeldungeon.utils.GLog;

/**
 * Состояние и действия админ-панели. Всё остаётся выключенным до тех пор,
 * пока не введён пароль.
 */
public final class AdminCore {

	public static final String PASSWORD = "1029384756";

	/** Уровень прокачки, до которого доводится выдаваемое снаряжение. */
	public static final int MAX_UPGRADE = 15;

	/** Сколько штук выдаётся за раз, если предмет складывается в стопку. */
	public static final int STACK_AMOUNT = 20;

	/** Становится true после ввода пароля, сбрасывается при перезапуске игры. */
	public static boolean unlocked = false;

	/** Бессмертие героя. */
	public static boolean invulnerable = false;

	/** Показывать панель автоматически при входе на уровень. */
	public static boolean autoOpen = true;

	private AdminCore() {
	}

	public static boolean unlock( String entered ) {
		if (PASSWORD.equals( entered )) {
			unlocked = true;
			return true;
		}
		return false;
	}

	/**
	 * Вызывается из пропатченного GameScene.create(): открывает панель (или
	 * окно ввода пароля) каждый раз, когда игрок заходит на уровень.
	 */
	public static void onLevelEntered() {
		try {
			if (!autoOpen) {
				return;
			}
			GameScene.show( unlocked ? (com.watabou.pixeldungeon.ui.Window)new WndAdmin()
					: (com.watabou.pixeldungeon.ui.Window)new WndAdminLogin() );
		} catch (Throwable t) {
			// сцена ещё не готова - просто не показываем панель
		}
	}

	public static void setInvulnerable( boolean on ) {
		invulnerable = on;
		if (on) {
			Hero hero = Dungeon.hero;
			if (hero != null && hero.HP < hero.HT) {
				hero.HP = hero.HT;
			}
		}
		GLog.i( on ? "Бессмертие включено." : "Бессмертие выключено.", new Object[0] );
	}

	/**
	 * Вызывается из пропатченного Hero.die(): не даёт герою умереть, пока
	 * включено бессмертие.
	 */
	public static void godRevive( Hero hero ) {
		try {
			if (hero != null && hero.HT > 0 && hero.HP <= 0) {
				hero.HP = hero.HT;
			}
		} catch (Throwable t) {
			// во время смерти делать больше нечего
		}
	}

	/**
	 * Превращает все тайные двери и скрытые ловушки текущего уровня в
	 * обычные и раскрывает карту - так же, как свиток магической карты.
	 * Возвращает количество найденных тайников.
	 */
	public static int revealSecrets() {
		int found = 0;
		try {
			Level level = Dungeon.level;
			if (level == null) {
				return 0;
			}

			int[] map = level.map;
			boolean[] mapped = level.mapped;
			boolean[] discoverable = Level.discoverable;
			int length = Level.LENGTH;

			for (int i = 0; i < length; i++) {
				if (discoverable != null && !discoverable[i]) {
					continue;
				}
				mapped[i] = true;

				int terr = map[i];
				if ((Terrain.flags[terr] & Terrain.SECRET) != 0) {
					Level.set( i, Terrain.discover( terr ) );
					GameScene.updateMap( i );
					if (Dungeon.visible[i]) {
						GameScene.discoverTile( i, terr );
					}
					found++;
				}
			}

			Dungeon.observe();
			GameScene.updateMap();
		} catch (Throwable t) {
			return found;
		}
		return found;
	}

	/** Те виды предметов, у которых уровень прокачки вообще что-то значит. */
	private static boolean upgradable( Item item ) {
		return item instanceof Weapon || item instanceof Armor
				|| item instanceof Wand || item instanceof Ring;
	}

	/** Настоящее название предмета - для списка выдачи. */
	public static String nameOf( Class cls ) {
		try {
			return ((Item)cls.newInstance()).trueName();
		} catch (Throwable t) {
			String n = cls.getName();
			return n.substring( n.lastIndexOf( '.' ) + 1 );
		}
	}

	/**
	 * Кладёт герою в рюкзак полностью прокачанную, опознанную и не проклятую
	 * копию предмета; если рюкзак полон - роняет её под ноги. Возвращает
	 * название предмета либо null, если создать его не удалось.
	 */
	public static String give( Class cls ) {
		try {
			Item item = (Item)cls.newInstance();

			if (upgradable( item ) && item.isUpgradable()) {
				item.upgrade( MAX_UPGRADE );
			}
			item.identify();
			item.cursed = false;
			item.cursedKnown = true;
			item.levelKnown = true;
			item.fix();

			if (item instanceof Wand) {
				Wand wand = (Wand)item;
				wand.updateLevel();
				wand.curCharges = wand.maxCharges;
			}
			if (item.stackable && item.quantity() < STACK_AMOUNT) {
				item.quantity( STACK_AMOUNT );
			}

			String name = item.name();
			if (!item.collect()) {
				Hero hero = Dungeon.hero;
				if (hero == null || Dungeon.level == null) {
					return null;
				}
				Heap heap = Dungeon.level.drop( item, hero.pos );
				if (heap != null && heap.sprite != null) {
					heap.sprite.drop();
				}
			}
			return name;
		} catch (Throwable t) {
			return null;
		}
	}
}
