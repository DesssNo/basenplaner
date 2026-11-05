package io.github.desssno.mcpainter.client;

import com.mojang.blaze3d.platform.InputConstants;
import io.github.desssno.mcpainter.bridge.BridgeServer;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.network.chat.Component;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.client.settings.KeyConflictContext;
import net.neoforged.neoforge.common.NeoForge;

/**
 * Pausemenü-Button „MCPainter“ und eine Tastenbelegung, die standardmäßig frei ist
 * (unter Optionen → Steuerung selbst belegbar).
 */
public final class MenuHooks {
    public static final KeyMapping OPEN_KEY = new KeyMapping(
            "key.mcpainter.open", KeyConflictContext.IN_GAME,
            InputConstants.UNKNOWN, "key.categories.mcpainter");

    private MenuHooks() {
    }

    public static void register(IEventBus modBus) {
        modBus.addListener(RegisterKeyMappingsEvent.class, e -> e.register(OPEN_KEY));
        NeoForge.EVENT_BUS.addListener(ClientTickEvent.Post.class, e -> onTick());
        NeoForge.EVENT_BUS.addListener(ScreenEvent.Init.Post.class, MenuHooks::onScreenInit);
    }

    public static void open() {
        // Etappe 0: Testseite. Ab Etappe 2 öffnet sich hier der Editor.
        Minecraft.getInstance().setScreen(new MCPainterScreen(BridgeServer.get().url("/test/")));
    }

    private static void onTick() {
        Minecraft mc = Minecraft.getInstance();
        while (OPEN_KEY.consumeClick()) {
            if (mc.screen == null) open();
        }
        DevAutotest.tick(mc);
    }

    private static void onScreenInit(ScreenEvent.Init.Post event) {
        if (event.getScreen() instanceof PauseScreen pause && pause.showsPauseMenu()) {
            event.addListener(Button.builder(Component.translatable("mcpainter.button.open"), b -> open())
                    .bounds(4, 4, 90, 20)
                    .build());
        }
    }
}
