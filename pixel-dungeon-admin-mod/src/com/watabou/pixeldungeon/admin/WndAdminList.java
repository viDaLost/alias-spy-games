package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.BitmapText;
import com.watabou.pixeldungeon.scenes.GameScene;
import com.watabou.pixeldungeon.ui.RedButton;

/** Страница списка предметов: нажатие на строку выдаёт предмет герою. */
public class WndAdminList extends AdminWnd {

	private static final int PER_PAGE = 6;
	private static final int ITEM_H   = 17;
	private static final int NAV_W    = 28;

	private final int category;

	BitmapText status;

	public WndAdminList( int category ) {
		this( category, 0 );
	}

	public WndAdminList( int category, int page ) {
		this.category = category;

		Class[] items = AdminCatalog.items( category );
		int pages = (items.length + PER_PAGE - 1) / PER_PAGE;

		addTitle( AdminCatalog.CATEGORIES[category] + " " + (page + 1) + "/" + pages );

		int first = page * PER_PAGE;
		int last = Math.min( first + PER_PAGE, items.length );
		for (int i = first; i < last; i++) {
			final Class cls = items[i];
			RedButton button = new RedButton( AdminCore.nameOf( cls ) ) {
				@Override
				public void onClick() {
					String name = AdminCore.give( cls );
					if (name != null) {
						center( status, "ВЫДАНО: " + name, 0x44FF44 );
					} else {
						center( status, "НЕ ПОЛУЧИЛОСЬ", 0xFF4444 );
					}
				}
			};
			add( button );
			button.setRect( 0, pos, WIDTH, ITEM_H );
			pos += ITEM_H + GAP;
		}

		// навигация по страницам - по кругу
		final int prev = page > 0 ? page - 1 : pages - 1;
		final int next = page < pages - 1 ? page + 1 : 0;

		RedButton back = new RedButton( "<" ) {
			@Override
			public void onClick() {
				hide();
				GameScene.show( new WndAdminList( WndAdminList.this.category, prev ) );
			}
		};
		add( back );
		back.setRect( 0, pos, NAV_W, BTN_HEIGHT );

		RedButton close = new RedButton( "НАЗАД" ) {
			@Override
			public void onClick() {
				hide();
				GameScene.show( new WndAdminItems() );
			}
		};
		add( close );
		close.setRect( NAV_W + GAP, pos, WIDTH - 2 * (NAV_W + GAP), BTN_HEIGHT );

		RedButton forward = new RedButton( ">" ) {
			@Override
			public void onClick() {
				hide();
				GameScene.show( new WndAdminList( WndAdminList.this.category, next ) );
			}
		};
		add( forward );
		forward.setRect( WIDTH - NAV_W, pos, NAV_W, BTN_HEIGHT );

		pos += BTN_HEIGHT + GAP;

		status = addLabel( "НАЖМИ НА ПРЕДМЕТ", 0xBBBBBB, 7 );

		finish();
	}
}
