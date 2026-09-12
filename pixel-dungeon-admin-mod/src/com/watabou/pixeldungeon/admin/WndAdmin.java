package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.BitmapText;
import com.watabou.pixeldungeon.scenes.GameScene;
import com.watabou.pixeldungeon.ui.RedButton;

/** Сама админ-панель: открывается только после ввода пароля. */
public class WndAdmin extends AdminWnd {

	BitmapText status;

	public WndAdmin() {
		addTitle( "АДМИН-ПАНЕЛЬ" );

		addRow( new RedButton( godLabel() ) {
			@Override
			public void onClick() {
				AdminCore.setInvulnerable( !AdminCore.invulnerable );
				text( godLabel() );
				center( status, AdminCore.invulnerable ? "ГЕРОЙ НЕУЯЗВИМ" : "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
						AdminCore.invulnerable ? 0x44FF44 : 0xBBBBBB );
			}
		} );

		addRow( new RedButton( "ТАЙНЫЕ КОМНАТЫ" ) {
			@Override
			public void onClick() {
				int found = AdminCore.revealSecrets();
				center( status, found > 0 ? "НАЙДЕНО ТАЙНИКОВ: " + found : "ТАЙНИКОВ ЗДЕСЬ НЕТ",
						found > 0 ? 0x44FF44 : 0xBBBBBB );
			}
		} );

		addRow( new RedButton( "ВЫДАТЬ ПРЕДМЕТ" ) {
			@Override
			public void onClick() {
				hide();
				GameScene.show( new WndAdminItems() );
			}
		} );

		addRow( new RedButton( autoLabel() ) {
			@Override
			public void onClick() {
				AdminCore.autoOpen = !AdminCore.autoOpen;
				text( autoLabel() );
				center( status, AdminCore.autoOpen ? "ПАНЕЛЬ ОТКРОЕТСЯ НА УРОВНЕ" : "АВТООТКРЫТИЕ ВЫКЛЮЧЕНО",
						0xBBBBBB );
			}
		} );

		addRow( new RedButton( "ЗАКРЫТЬ" ) {
			@Override
			public void onClick() {
				hide();
			}
		} );

		status = addLabel( AdminCore.invulnerable ? "ГЕРОЙ НЕУЯЗВИМ" : "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
				AdminCore.invulnerable ? 0x44FF44 : 0xBBBBBB, 7 );

		finish();
	}

	static String godLabel() {
		return AdminCore.invulnerable ? "БЕССМЕРТИЕ: ВКЛ" : "БЕССМЕРТИЕ: ВЫКЛ";
	}

	static String autoLabel() {
		return AdminCore.autoOpen ? "АВТООТКРЫТИЕ: ВКЛ" : "АВТООТКРЫТИЕ: ВЫКЛ";
	}
}
