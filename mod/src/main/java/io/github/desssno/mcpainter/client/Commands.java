package io.github.desssno.mcpainter.client;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import io.github.desssno.mcpainter.bridge.BridgeServer;
import io.github.desssno.mcpainter.build.BuildManager;
import io.github.desssno.mcpainter.build.Job;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.Style;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import net.neoforged.neoforge.common.NeoForge;

import static net.minecraft.commands.Commands.literal;

/**
 * Client-Befehle: {@code /mcpainter code} zeigt den Kopplungscode für den normalen Browser,
 * {@code /mcpainter undo} macht den letzten Bau rückgängig (Einzelspieler).
 */
public final class Commands {
    private Commands() {
    }

    public static void register() {
        NeoForge.EVENT_BUS.addListener(RegisterClientCommandsEvent.class, e -> register(e.getDispatcher()));
    }

    private static void register(CommandDispatcher<CommandSourceStack> d) {
        d.register(literal("mcpainter")
                .then(literal("code").executes(Commands::code))
                .then(literal("undo").executes(Commands::undo)));
    }

    private static int code(CommandContext<CommandSourceStack> ctx) {
        String code = BridgeServer.get().pairingCode();
        Component value = Component.literal(code).withStyle(Style.EMPTY
                .withColor(ChatFormatting.AQUA).withUnderlined(true)
                .withClickEvent(new ClickEvent(ClickEvent.Action.COPY_TO_CLIPBOARD, code))
                .withHoverEvent(new HoverEvent(HoverEvent.Action.SHOW_TEXT, Component.translatable("mcpainter.code.copy"))));
        ctx.getSource().sendSystemMessage(Component.translatable("mcpainter.code", value));
        ctx.getSource().sendSystemMessage(Component.translatable("mcpainter.code.hint").withStyle(ChatFormatting.GRAY));
        return 1;
    }

    private static int undo(CommandContext<CommandSourceStack> ctx) {
        Minecraft mc = Minecraft.getInstance();
        MinecraftServer server = mc.getSingleplayerServer();
        if (server == null || mc.player == null) {
            ctx.getSource().sendFailure(Component.translatable("mcpainter.undo.singleplayer"));
            return 0;
        }
        var id = mc.player.getUUID();
        server.execute(() -> {
            ServerPlayer p = server.getPlayerList().getPlayer(id);
            if (p == null || !(server.isSingleplayerOwner(p.getGameProfile()) || p.hasPermissions(2))) {
                if (p != null) p.sendSystemMessage(Component.translatable("mcpainter.undo.denied").withStyle(ChatFormatting.RED));
                return;
            }
            try {
                Job job = BuildManager.undo(server);
                p.sendSystemMessage(job == null
                        ? Component.translatable("mcpainter.undo.none").withStyle(ChatFormatting.YELLOW)
                        : Component.translatable("mcpainter.undo.started", job.toJson().get("total").getAsInt()));
            } catch (Exception e) {
                p.sendSystemMessage(Component.translatable("mcpainter.undo.failed", e.getMessage()).withStyle(ChatFormatting.RED));
            }
        });
        return 1;
    }
}
