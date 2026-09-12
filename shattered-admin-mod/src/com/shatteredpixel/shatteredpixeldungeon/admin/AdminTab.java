package com.shatteredpixel.shatteredpixeldungeon.admin;

import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;

/**
 * Ярлык у правого края игрового экрана: панель сворачивается в него и оттуда
 * же разворачивается обратно.
 */
public class AdminTab extends RedButton {

	static final int TAB_W = 26;
	static final int TAB_H = 20;

	public AdminTab() {
		super( "АДМ" );
	}

	@Override
	public void onClick() {
		AdminCore.openPanel();
	}
}
