package com.watabou.pixeldungeon.admin;

import com.watabou.pixeldungeon.scenes.GameScene;
import com.watabou.pixeldungeon.ui.RedButton;

/** Выбор категории на экране выдачи предметов. */
public class WndAdminItems extends AdminWnd {

	/** Строки здесь ниже обычных: категорий много, окно должно влезать в экран. */
	private static final int ROW_H = 16;

	public WndAdminItems() {
		addTitle( "ВЫДАТЬ ПРЕДМЕТ" );
		addLabel( "СНАРЯЖЕНИЕ ИДЁТ +" + AdminCore.MAX_UPGRADE, 0xBBBBBB, 7 );

		for (int i = 0; i < AdminCatalog.CATEGORIES.length; i++) {
			final int category = i;
			row( new RedButton( AdminCatalog.CATEGORIES[i] ) {
				@Override
				public void onClick() {
					hide();
					GameScene.show( new WndAdminList( category ) );
				}
			} );
		}

		row( new RedButton( "НАЗАД" ) {
			@Override
			public void onClick() {
				hide();
				GameScene.show( new WndAdmin() );
			}
		} );

		finish();
	}

	private void row( RedButton button ) {
		add( button );
		button.setRect( 0, pos, WIDTH, ROW_H );
		pos += ROW_H + GAP;
	}
}
