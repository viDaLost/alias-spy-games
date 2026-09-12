package com.watabou.pixeldungeon.admin;

import com.watabou.pixeldungeon.ui.RedButton;

/** Выбор категории на экране выдачи предметов. */
public class WndAdminItems extends AdminWnd {

	private static final int ROW_H = 16;
	private static final int COL_W = (WIDTH - GAP) / 2;

	public WndAdminItems() {
		AdminCore.remember( AdminCore.SCREEN_ITEMS, AdminCore.category, AdminCore.page );

		addTitle( "ВЫДАТЬ ПРЕДМЕТ" );
		addLabel( "СНАРЯЖЕНИЕ ИДЁТ +" + AdminCore.MAX_UPGRADE, DIM, 7 );

		int top = pos;
		String[] categories = AdminCatalog.CATEGORIES;
		for (int i = 0; i < categories.length; i++) {
			final int category = i;
			place( new RedButton( categories[i] ) {
				@Override
				public void onClick() {
					AdminCore.swap( WndAdminItems.this, new WndAdminList( category, 0 ) );
				}
			}, (i % 2) * (COL_W + GAP), top + (i / 2) * (ROW_H + GAP), COL_W, ROW_H );
		}

		pos = top + ((categories.length + 1) / 2) * (ROW_H + GAP);

		addRow( new RedButton( "НАЗАД" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdminItems.this, new WndAdmin() );
			}
		} );

		finish();
	}
}
