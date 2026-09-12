package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.BitmapText;
import com.watabou.pixeldungeon.ui.RedButton;

/** Сама админ-панель: открывается только после ввода пароля. */
public class WndAdmin extends AdminWnd {

	BitmapText status;

	public WndAdmin() {
		AdminCore.remember( AdminCore.SCREEN_PANEL, AdminCore.category, AdminCore.page );

		addTitle( "АДМИН-ПАНЕЛЬ" );

		addRow( new RedButton( godLabel() ) {
			@Override
			public void onClick() {
				AdminCore.setInvulnerable( !AdminCore.invulnerable );
				text( godLabel() );
				center( status, AdminCore.invulnerable ? "ГЕРОЙ НЕУЯЗВИМ" : "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
						AdminCore.invulnerable ? GREEN : DIM );
			}
		} );

		addRow( new RedButton( wearLabel() ) {
			@Override
			public void onClick() {
				AdminCore.setUnbreakable( !AdminCore.unbreakable );
				text( wearLabel() );
				center( status, AdminCore.unbreakable ? "ВЕЩИ НЕ ЛОМАЮТСЯ" : "ВЕЩИ СНОВА ИЗНАШИВАЮТСЯ",
						AdminCore.unbreakable ? GREEN : DIM );
			}
		} );

		addRow( new RedButton( "ТАЙНЫЕ КОМНАТЫ" ) {
			@Override
			public void onClick() {
				int found = AdminCore.revealSecrets();
				center( status, found > 0 ? "НАЙДЕНО ТАЙНИКОВ: " + found : "ТАЙНИКОВ ЗДЕСЬ НЕТ",
						found > 0 ? GREEN : DIM );
			}
		} );

		addRow( new RedButton( "ВЫДАТЬ ПРЕДМЕТ" ) {
			@Override
			public void onClick() {
				AdminCore.swap( WndAdmin.this, new WndAdminItems() );
			}
		} );

		addRow( new RedButton( autoLabel() ) {
			@Override
			public void onClick() {
				AdminCore.autoOpen = !AdminCore.autoOpen;
				text( autoLabel() );
				center( status, AdminCore.autoOpen ? "ОТКРОЕТСЯ САМА НА УРОВНЕ" : "ОТКРЫВАТЬ ЧЕРЕЗ ЯРЛЫК",
						DIM );
			}
		} );

		addRow( new RedButton( "СВЕРНУТЬ" ) {
			@Override
			public void onClick() {
				hide();
			}
		} );

		status = addLabel( AdminCore.invulnerable ? "ГЕРОЙ НЕУЯЗВИМ" : "ЯРЛЫК СПРАВА РАЗВЕРНЁТ ОБРАТНО",
				AdminCore.invulnerable ? GREEN : DIM, 7 );

		finish();
	}

	static String godLabel() {
		return AdminCore.invulnerable ? "БЕССМЕРТИЕ: ВКЛ" : "БЕССМЕРТИЕ: ВЫКЛ";
	}

	static String wearLabel() {
		return AdminCore.unbreakable ? "ИЗНОС ВЕЩЕЙ: ВЫКЛ" : "ИЗНОС ВЕЩЕЙ: ВКЛ";
	}

	static String autoLabel() {
		return AdminCore.autoOpen ? "АВТООТКРЫТИЕ: ВКЛ" : "АВТООТКРЫТИЕ: ВЫКЛ";
	}
}
