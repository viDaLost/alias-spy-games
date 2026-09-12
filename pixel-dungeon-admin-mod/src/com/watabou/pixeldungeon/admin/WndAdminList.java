package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.BitmapText;
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

		String[] items = AdminCatalog.items( category );
		int pages = (items.length + PER_PAGE - 1) / PER_PAGE;
		if (page >= pages) {
			page = 0;
		}
		AdminCore.remember( AdminCore.SCREEN_LIST, category, page );

		addTitle( AdminCatalog.CATEGORIES[category] + " " + (page + 1) + "/" + pages );

		int first = page * PER_PAGE;
		int last = Math.min( first + PER_PAGE, items.length );
		for (int i = first; i < last; i++) {
			final String cls = items[i];
			place( new RedButton( AdminCore.nameOf( cls ) ) {
				@Override
				public void onClick() {
					String name = AdminCore.give( cls );
					if (name != null) {
						center( status, "ВЫДАНО: " + name, GREEN );
					} else {
						center( status, "НЕ ПОЛУЧИЛОСЬ", RED );
					}
				}
			}, 0, pos, WIDTH, ITEM_H );
			pos += ITEM_H + GAP;
		}

		// навигация по страницам - по кругу
		final int prev = page > 0 ? page - 1 : pages - 1;
		final int next = page < pages - 1 ? page + 1 : 0;

		place( new RedButton( "<" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminList.this,
						new WndAdminList( WndAdminList.this.category, prev ) );
			}
		}, 0, pos, NAV_W, BTN_HEIGHT );

		place( new RedButton( "НАЗАД" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminList.this, new WndAdminItems() );
			}
		}, NAV_W + GAP, pos, WIDTH - 2 * (NAV_W + GAP), BTN_HEIGHT );

		place( new RedButton( ">" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminList.this,
						new WndAdminList( WndAdminList.this.category, next ) );
			}
		}, WIDTH - NAV_W, pos, NAV_W, BTN_HEIGHT );

		pos += BTN_HEIGHT + GAP;

		status = addLabel( "НАЖМИ НА ПРЕДМЕТ", DIM, 7 );

		finish();
	}
}
