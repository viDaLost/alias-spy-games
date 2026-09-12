package com.shatteredpixel.shatteredpixeldungeon.admin;

import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;

/** Выбор категории на экране выдачи предметов. */
public class WndAdminItems extends AdminWnd {

	private static final int PER_PAGE = 9;
	private static final int ROW_H    = 15;
	private static final int NAV_W    = 28;
	private static final int COL_W    = (WIDTH - GAP) / 2;

	public WndAdminItems() {
		this( 0 );
	}

	public WndAdminItems( int page ) {
		String[] categories = AdminCatalog.CATEGORIES;
		int pages = (categories.length + PER_PAGE - 1) / PER_PAGE;
		if (page >= pages) {
			page = 0;
		}
		AdminCore.catPage = page;
		AdminCore.remember( AdminCore.SCREEN_ITEMS, AdminCore.category, AdminCore.page );

		addTitle( "ВЫДАТЬ ПРЕДМЕТ " + (page + 1) + "/" + pages );

		int top = pos;
		int first = page * PER_PAGE;
		int last = Math.min( first + PER_PAGE, categories.length );
		for (int i = first; i < last; i++) {
			final int category = i;
			int slot = i - first;
			place( new RedButton( categories[i], 7 ) {
				@Override
				public void onClick() {
					AdminCore.swap( WndAdminItems.this, new WndAdminList( category, 0 ) );
				}
			}, (slot % 2) * (COL_W + GAP), top + (slot / 2) * (ROW_H + GAP), COL_W, ROW_H );
		}

		pos = top + ((last - first + 1) / 2) * (ROW_H + GAP);

		// навигация по страницам - по кругу
		final int prev = page > 0 ? page - 1 : pages - 1;
		final int next = page < pages - 1 ? page + 1 : 0;

		place( new RedButton( "<" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminItems.this, new WndAdminItems( prev ) );
			}
		}, 0, pos, NAV_W, BTN_HEIGHT );

		place( new RedButton( "НАЗАД" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminItems.this, new WndAdmin() );
			}
		}, NAV_W + GAP, pos, WIDTH - 2 * (NAV_W + GAP), BTN_HEIGHT );

		place( new RedButton( ">" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminItems.this, new WndAdminItems( next ) );
			}
		}, WIDTH - NAV_W, pos, NAV_W, BTN_HEIGHT );

		pos += BTN_HEIGHT + GAP;
		finish();
	}
}
