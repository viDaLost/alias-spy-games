package com.shatteredpixel.shatteredpixeldungeon.admin;

import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;

/** Сама админ-панель: открывается только после ввода пароля. */
public class WndAdmin extends AdminWnd {

	RenderedTextBlock status;

	public WndAdmin() {
		AdminCore.remember( AdminCore.SCREEN_PANEL, AdminCore.category, AdminCore.page );

		addTitle( "АДМИН-ПАНЕЛЬ" );

		addRow( new RedButton( godLabel() ) {
			@Override
			public void onClick() {
				AdminCore.setInvulnerable( !AdminCore.invulnerable );
				text( godLabel() );
				restate( status, AdminCore.invulnerable ? "ГЕРОЙ НЕУЯЗВИМ" : "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
						AdminCore.invulnerable ? GREEN : DIM );
			}
		} );

		addRow( new RedButton( chargeLabel() ) {
			@Override
			public void onClick() {
				AdminCore.setUnlimitedCharges( !AdminCore.unlimitedCharges );
				text( chargeLabel() );
				restate( status, AdminCore.unlimitedCharges ? "ЖЕЗЛЫ НЕ РАЗРЯЖАЮТСЯ" : "ЗАРЯДЫ ТРАТЯТСЯ",
						AdminCore.unlimitedCharges ? GREEN : DIM );
			}
		} );

		addRow( new RedButton( "ТАЙНЫЕ КОМНАТЫ" ) {
			@Override
			public void onClick() {
				int found = AdminCore.revealSecrets();
				restate( status, found > 0 ? "НАЙДЕНО ТАЙНИКОВ: " + found : "ТАЙНИКОВ ЗДЕСЬ НЕТ",
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
				restate( status, AdminCore.autoOpen ? "ОТКРОЕТСЯ САМА НА УРОВНЕ" : "ОТКРЫВАТЬ ЧЕРЕЗ ЯРЛЫК",
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

	static String chargeLabel() {
		return AdminCore.unlimitedCharges ? "ЗАРЯДЫ: ВЕЧНЫЕ" : "ЗАРЯДЫ: ОБЫЧНЫЕ";
	}

	static String autoLabel() {
		return AdminCore.autoOpen ? "АВТООТКРЫТИЕ: ВКЛ" : "АВТООТКРЫТИЕ: ВЫКЛ";
	}
}
