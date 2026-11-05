package io.github.desssno.mcpainter;

import io.github.desssno.mcpainter.client.MenuHooks;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

/**
 * Client-Einstieg: Tastenbelegung, Pausemenü-Button und (Etappe 0) der Testbildschirm.
 */
@Mod(value = MCPainter.MODID, dist = Dist.CLIENT)
public class MCPainterClient {
    public MCPainterClient(IEventBus modBus) {
        MenuHooks.register(modBus);
    }
}
