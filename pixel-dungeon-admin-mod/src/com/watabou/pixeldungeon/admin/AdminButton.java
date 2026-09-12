package com.watabou.pixeldungeon.admin;

import com.watabou.pixeldungeon.ui.RedButton;
import com.watabou.pixeldungeon.ui.Window;

/** Кнопка, добавленная во внутриигровое меню. */
public class AdminButton extends RedButton {

	private final Window parent;

	public AdminButton( Window parent ) {
		super( "АДМИН-ПАНЕЛЬ" );
		this.parent = parent;
	}

	@Override
	public void onClick() {
		if (parent != null) {
			parent.hide();
		}
		AdminCore.openPanel();
	}
}
