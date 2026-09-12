package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Scene;
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
import com.watabou.pixeldungeon.scenes.PixelScene;
import com.watabou.pixeldungeon.ui.Window;
import com.watabou.pixeldungeon.utils.GLog;

import java.util.Iterator;

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

	// какое окно панели показать при развороте
	static final int SCREEN_PANEL = 0;
	static final int SCREEN_ITEMS = 1;
	static final int SCREEN_LIST = 2;

	/** Становится true после ввода пароля, сбрасывается при перезапуске игры. */
	public static boolean unlocked = false;

	/** Бессмертие героя. */
	public static boolean invulnerable = false;

	/** Вещи не тратят прочность и не ломаются. */
	public static boolean unbreakable = false;

	/** Разворачивать панель самостоятельно при входе на уровень. */
	public static boolean autoOpen = true;

	// куда возвращаться после сворачивания
	static int screen = SCREEN_PANEL;
	static int category = 0;
	static int page = 0;

	private AdminCore() {
	}

	public static boolean unlock( String entered ) {
		if (PASSWORD.equals( entered )) {
			unlocked = true;
			return true;
		}
		return false;
	}

	/** Запоминает, на каком экране панель свернули. */
	static void remember( int where, int cat, int pg ) {
		screen = where;
		category = cat;
		page = pg;
	}

	/** Разворачивает панель там же, где её свернули. */
	public static void openPanel() {
		try {
			if (!unlocked) {
				GameScene.show( new WndAdminLogin() );
			} else if (screen == SCREEN_LIST) {
				GameScene.show( new WndAdminList( category, page ) );
			} else if (screen == SCREEN_ITEMS) {
				GameScene.show( new WndAdminItems() );
			} else {
				GameScene.show( new WndAdmin() );
			}
		} catch (Throwable t) {
			// сцена ещё не готова - просто не показываем панель
		}
	}

	/**
	 * Вызывается из пропатченного GameScene.create(): вешает на экран ярлык
	 * панели и, если так настроено, сразу её разворачивает.
	 */
	public static void onLevelEntered() {
		try {
			addTab();
			if (autoOpen) {
				openPanel();
			}
		} catch (Throwable t) {
			// на всякий случай: без панели игра всё равно должна работать
		}
	}

	/** Маленькая кнопка у правого края, из которой панель разворачивается. */
	private static void addTab() {
		Scene scene = Game.scene();
		Camera ui = PixelScene.uiCamera;
		if (scene == null || ui == null) {
			return;
		}
		AdminTab tab = new AdminTab();
		tab.camera = ui;
		scene.add( tab );
		tab.setRect( ui.width - AdminTab.TAB_W - 2, 36, AdminTab.TAB_W, AdminTab.TAB_H );
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

	public static void setUnbreakable( boolean on ) {
		unbreakable = on;
		if (on) {
			repairAll();
		}
		GLog.i( on ? "Вещи больше не изнашиваются." : "Износ вещей вернулся.", new Object[0] );
	}

	/** Чинит всё, что уже успело износиться, включая надетое. */
	private static void repairAll() {
		try {
			Hero hero = Dungeon.hero;
			if (hero == null || hero.belongings == null) {
				return;
			}
			Iterator it = hero.belongings.iterator();
			while (it.hasNext()) {
				Object next = it.next();
				if (next instanceof Item) {
					((Item)next).fix();
				}
			}
		} catch (Throwable t) {
			// не смогли обойти рюкзак - переключатель всё равно уже работает
		}
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
	 * обычные и раскрывает карту, как свиток магической карты. Возвращает
	 * количество найденных тайников.
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

	/** Те виды предметов, у которых уровень прокачки что-то значит. */
	private static boolean upgradable( Item item ) {
		return item instanceof Weapon || item instanceof Armor
				|| item instanceof Wand || item instanceof Ring;
	}

	private static Item create( String className ) throws Exception {
		return (Item)Class.forName( className ).newInstance();
	}

	/** Настоящее название предмета - для списка выдачи. */
	public static String nameOf( String className ) {
		try {
			return create( className ).trueName();
		} catch (Throwable t) {
			return className.substring( className.lastIndexOf( '.' ) + 1 );
		}
	}

	/**
	 * Кладёт герою в рюкзак полностью прокачанную, опознанную и не проклятую
	 * копию предмета; если рюкзак полон - роняет её под ноги. Возвращает
	 * название предмета либо null, если создать его не удалось.
	 */
	public static String give( String className ) {
		try {
			Item item = create( className );

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

	/** Показывает окно панели, не забывая свернуть текущее. */
	static void swap( Window current, Window next ) {
		current.hide();
		GameScene.show( next );
	}
}
