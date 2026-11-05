package io.github.desssno.mcpainter;

import io.github.desssno.mcpainter.bridge.Api;
import io.github.desssno.mcpainter.client.Commands;
import io.github.desssno.mcpainter.client.MenuHooks;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

/**
 * Client-Einstieg: Tastenbelegung, Pausemenü-Button, Befehle und die Brücke zum integrierten Server.
 */
@Mod(value = MCPainter.MODID, dist = Dist.CLIENT)
public class MCPainterClient {
    public MCPainterClient(IEventBus modBus) {
        MenuHooks.register(modBus);
        Commands.register();
        // Einzelspieler: die Brücke spricht mit dem integrierten Server, als der lokale Spieler
        Api.setContext(() -> Minecraft.getInstance().getSingleplayerServer(),
                () -> Minecraft.getInstance().getUser().getProfileId());
    }
}
