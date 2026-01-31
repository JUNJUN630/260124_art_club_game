import math
import os
import random
import sys
import pygame

# Logical resolution
LOGICAL_W = 320
LOGICAL_H = 288
FPS = 30

# Colors
WHITE = (240, 240, 240)
BLACK = (20, 20, 20)
RED = (220, 80, 80)
GREEN = (80, 220, 120)
BLUE = (80, 140, 220)
YELLOW = (230, 210, 80)
MAGENTA = (220, 100, 200)
CYAN = (80, 220, 220)
ORANGE = (255, 140, 0)
PURPLE = (160, 120, 220)
SILVER = (200, 200, 220)

STATE_PLAYING = "PLAYING"
STATE_BOSS = "BOSS"
STATE_GAMEOVER = "GAMEOVER"
STATE_CLEAR = "CLEAR"

BELL_COLORS = [YELLOW, MAGENTA, CYAN, ORANGE, PURPLE, SILVER]
BELL_EFFECTS = ["SPREAD", "RAPID", "SCORE", "SHIELD", "INVINCIBLE", "REFLECT"]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def vec_from_angle(deg, speed):
    rad = math.radians(deg)
    return math.cos(rad) * speed, math.sin(rad) * speed


class Entity:
    def __init__(self, x, y, r):
        self.x = x
        self.y = y
        self.r = r
        self.alive = True

    def rect(self):
        return pygame.Rect(int(self.x - self.r), int(self.y - self.r), int(self.r * 2), int(self.r * 2))

    def update(self, game):
        pass

    def draw(self, surf, debug=False):
        pass


class Player(Entity):
    def __init__(self, x, y):
        super().__init__(x, y, 6)
        self.speed = 3.0
        self.lives = 3
        self.invuln = 0
        self.invincible_timer = 0
        self.invincible_charges = 0
        self.shield = 0
        self.shot_cd = 0
        self.shot_interval = 6  # frames
        self.spread = False
        self.score_mult = 1
        self.reflect = False

    def update(self, game):
        keys = pygame.key.get_pressed()
        dx = (1 if keys[pygame.K_RIGHT] else 0) - (1 if keys[pygame.K_LEFT] else 0)
        dy = (1 if keys[pygame.K_DOWN] else 0) - (1 if keys[pygame.K_UP] else 0)
        if dx != 0 and dy != 0:
            dx *= 0.7071
            dy *= 0.7071
        self.x += dx * self.speed
        self.y += dy * self.speed
        self.x = clamp(self.x, self.r, LOGICAL_W - self.r)
        self.y = clamp(self.y, self.r, LOGICAL_H - self.r)

        if self.invuln > 0:
            self.invuln -= 1
        if self.invincible_timer > 0:
            self.invincible_timer -= 1

        if self.shot_cd > 0:
            self.shot_cd -= 1

        if keys[pygame.K_z] and self.shot_cd == 0:
            self.fire(game)
            self.shot_cd = self.shot_interval

    def fire(self, game):
        if self.spread:
            angles = [-90, -120, -60]
        else:
            angles = [-90]
        for ang in angles:
            vx, vy = vec_from_angle(ang, 6.0)
            if self.reflect and random.random() < 0.25:
                game.player_bullets.append(ReflectBullet(self.x, self.y - 6, vx, vy, 2))
            else:
                game.player_bullets.append(PlayerBullet(self.x, self.y - 6, vx, vy))

    def hit(self, game):
        if self.invuln > 0 or self.invincible_timer > 0:
            return
        self.lives -= 1
        self.invuln = FPS  # 1 sec
        if self.lives <= 0:
            game.state = STATE_GAMEOVER

    def draw(self, surf, debug=False):
        if self.invincible_timer > 0:
            color = (120, 220, 255)
        else:
            color = GREEN if self.invuln == 0 or (self.invuln // 4) % 2 == 0 else (60, 120, 60)
        pygame.draw.polygon(
            surf,
            color,
            [(self.x, self.y - 8), (self.x - 6, self.y + 6), (self.x + 6, self.y + 6)],
        )
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class PlayerBullet(Entity):
    def __init__(self, x, y, vx, vy):
        super().__init__(x, y, 2)
        self.vx = vx
        self.vy = vy

    def update(self, game):
        self.x += self.vx
        self.y += self.vy
        if self.y < -10 or self.y > LOGICAL_H + 10 or self.x < -10 or self.x > LOGICAL_W + 10:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, WHITE, (int(self.x), int(self.y)), 2)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class ReflectBullet(PlayerBullet):
    def __init__(self, x, y, vx, vy, bounces):
        super().__init__(x, y, vx, vy)
        self.bounces_left = bounces

    def update(self, game):
        self.x += self.vx
        self.y += self.vy

        hit_wall = False
        if self.x - self.r <= 0 or self.x + self.r >= LOGICAL_W:
            hit_wall = True
            self.vx *= -1
            self.x = clamp(self.x, self.r, LOGICAL_W - self.r)
        if self.y - self.r <= 0 or self.y + self.r >= LOGICAL_H:
            hit_wall = True
            self.vy *= -1
            self.y = clamp(self.y, self.r, LOGICAL_H - self.r)

        if hit_wall:
            if self.bounces_left > 0:
                self.bounces_left -= 1
            else:
                self.alive = False

        if self.y < -20 or self.y > LOGICAL_H + 20 or self.x < -20 or self.x > LOGICAL_W + 20:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, SILVER, (int(self.x), int(self.y)), 2)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class EnemyBullet(Entity):
    def __init__(self, x, y, vx, vy):
        super().__init__(x, y, 3)
        self.vx = vx
        self.vy = vy

    def update(self, game):
        self.x += self.vx
        self.y += self.vy
        if self.y < -10 or self.y > LOGICAL_H + 10 or self.x < -10 or self.x > LOGICAL_W + 10:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, YELLOW, (int(self.x), int(self.y)), 3)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class ExplodeBullet(EnemyBullet):
    def __init__(self, x, y, vx, vy, fuse_frames):
        super().__init__(x, y, vx, vy)
        self.fuse = fuse_frames

    def update(self, game):
        self.x += self.vx
        self.y += self.vy
        self.fuse -= 1
        if self.fuse <= 0:
            self.explode(game)
            self.alive = False
            return
        if self.y < -10 or self.y > LOGICAL_H + 10 or self.x < -10 or self.x > LOGICAL_W + 10:
            self.alive = False

    def explode(self, game):
        count = 8
        for i in range(count):
            ang = i * (360 / count)
            vx, vy = vec_from_angle(ang, 2.0)
            game.enemy_bullets.append(EnemyBullet(self.x, self.y, vx, vy))

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, ORANGE, (int(self.x), int(self.y)), 4)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class Enemy(Entity):
    def __init__(self, x, y, r, hp, score):
        super().__init__(x, y, r)
        self.hp = hp
        self.score = score
        self.shot_timer = random.randint(30, 90)

    def take_damage(self, dmg, game):
        self.hp -= dmg
        if self.hp <= 0:
            self.alive = False
            game.add_score(self.score)
            if random.random() < game.bell_drop_rate:
                game.bells.append(Bell(self.x, self.y))

    def try_shoot_at_player(self, game, speed=2.0):
        if self.shot_timer > 0:
            self.shot_timer -= 1
            return
        self.shot_timer = random.randint(40, 100)
        dx = game.player.x - self.x
        dy = game.player.y - self.y
        dist = math.hypot(dx, dy)
        if dist == 0:
            return
        vx = dx / dist * speed
        vy = dy / dist * speed
        game.enemy_bullets.append(EnemyBullet(self.x, self.y, vx, vy))


class ZigZagEnemy(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, 7, 2, 100)
        self.vy = 1.2
        self.phase = random.random() * math.pi * 2

    def update(self, game):
        self.y += self.vy
        self.x += math.sin(self.y / 18 + self.phase) * 1.3
        self.try_shoot_at_player(game, speed=2.0)
        if self.y > LOGICAL_H + 20:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.rect(surf, BLUE, self.rect())
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class ChargeEnemy(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, 7, 2, 120)
        self.vy = 0.8
        self.charged = False
        self.vx = 0.0

    def update(self, game):
        if not self.charged and self.y > 60:
            dx = game.player.x - self.x
            dy = game.player.y - self.y
            dist = math.hypot(dx, dy) or 1.0
            self.vx = dx / dist * 4.0
            self.vy = dy / dist * 4.0
            self.charged = True
        self.x += self.vx
        self.y += self.vy
        self.try_shoot_at_player(game, speed=2.0)
        if self.y > LOGICAL_H + 20 or self.x < -20 or self.x > LOGICAL_W + 20:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.rect(surf, RED, self.rect())
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class TankEnemy(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, 9, 6, 200)
        self.vy = 0.7

    def update(self, game):
        self.y += self.vy
        self.try_shoot_at_player(game, speed=1.7)
        if self.y > LOGICAL_H + 30:
            self.alive = False

    def draw(self, surf, debug=False):
        pygame.draw.rect(surf, (120, 200, 120), self.rect())
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class Bell(Entity):
    def __init__(self, x, y):
        super().__init__(x, y, 6)
        self.color_index = 0
        self.vy = 1.0

    def update(self, game):
        self.y += self.vy
        if self.y > LOGICAL_H + 10:
            self.alive = False

    def cycle(self):
        self.color_index = (self.color_index + 1) % len(BELL_COLORS)

    def apply(self, player):
        effect = BELL_EFFECTS[self.color_index]
        if effect == "SPREAD":
            player.spread = True
        elif effect == "RAPID":
            player.shot_interval = max(2, player.shot_interval - 2)
        elif effect == "SCORE":
            player.score_mult = min(4, player.score_mult + 1)
        elif effect == "SHIELD":
            player.shield += 1
        elif effect == "INVINCIBLE":
            player.invincible_charges += 1
        elif effect == "REFLECT":
            player.reflect = True

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, BELL_COLORS[self.color_index], (int(self.x), int(self.y)), 6)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class Boss(Entity):
    def __init__(self):
        super().__init__(LOGICAL_W / 2, -30, 16)
        self.hp = 400
        self.vy = 1.0
        self.state = "ENTER"
        self.shot_timer = 30
        self.special_timer = 180

    def update(self, game):
        if self.state == "ENTER":
            self.y += self.vy
            if self.y >= 60:
                self.state = "FIGHT"
        else:
            self.x += math.sin(pygame.time.get_ticks() / 400) * 0.6
            self.shot_timer -= 1
            if self.shot_timer <= 0:
                self.shot_timer = 30
                self.fan_shot(game)
            self.special_timer -= 1
            if self.special_timer <= 0:
                self.special_timer = 180
                self.special_attack(game)

    def fan_shot(self, game):
        count = random.randint(4, 6)
        spread = 70
        dx = game.player.x - self.x
        dy = game.player.y - self.y
        base = math.degrees(math.atan2(dy, dx))
        start = base - spread / 2
        step = spread / (count - 1)
        for i in range(count):
            ang = start + step * i
            vx, vy = vec_from_angle(ang, 2.2)
            if random.random() < 0.1:
                game.enemy_bullets.append(ExplodeBullet(self.x, self.y, vx, vy, FPS * 3))
            else:
                game.enemy_bullets.append(EnemyBullet(self.x, self.y, vx, vy))

    def special_attack(self, game):
        # Radial burst
        count = 16
        for i in range(count):
            ang = i * (360 / count)
            vx, vy = vec_from_angle(ang, 2.0)
            if random.random() < 0.1:
                game.enemy_bullets.append(ExplodeBullet(self.x, self.y, vx, vy, FPS * 3))
            else:
                game.enemy_bullets.append(EnemyBullet(self.x, self.y, vx, vy))

    def take_damage(self, dmg, game):
        self.hp -= dmg
        if self.hp <= 0:
            self.alive = False
            game.state = STATE_CLEAR

    def draw(self, surf, debug=False):
        pygame.draw.circle(surf, (200, 120, 60), (int(self.x), int(self.y)), 16)
        if debug:
            pygame.draw.circle(surf, RED, (int(self.x), int(self.y)), int(self.r), 1)


class Game:
    def __init__(self, screen, scale):
        self.screen = screen
        self.scale = scale
        self.surface = pygame.Surface((LOGICAL_W, LOGICAL_H))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("Arial", 12)
        self.big_font = pygame.font.SysFont("Arial", 18)
        self.reset()

    def reset(self):
        self.state = STATE_PLAYING
        self.player = Player(LOGICAL_W / 2, LOGICAL_H - 40)
        self.player_bullets = []
        self.enemy_bullets = []
        self.enemies = []
        self.bells = []
        self.boss = None
        self.score = 0
        self.spawn_timer = 0
        self.phase_time = 0
        self.debug_collision = False
        self.bell_drop_rate = 0.5

    def add_score(self, base):
        self.score += base * self.player.score_mult

    def spawn_enemy(self):
        x = random.randint(20, LOGICAL_W - 20)
        t = random.random()
        if t < 0.4:
            self.enemies.append(ZigZagEnemy(x, -10))
        elif t < 0.75:
            self.enemies.append(ChargeEnemy(x, -10))
        else:
            self.enemies.append(TankEnemy(x, -10))

    def update_playing(self):
        self.phase_time += 1
        if self.phase_time >= FPS * 60 and self.state == STATE_PLAYING:
            self.start_boss()
            return

        self.spawn_timer -= 1
        if self.spawn_timer <= 0:
            self.spawn_timer = random.randint(40, 80)
            self.spawn_enemy()

    def update_boss(self):
        self.spawn_timer -= 1
        if self.spawn_timer <= 0:
            self.spawn_timer = random.randint(50, 90)
            self.spawn_enemy()

    def start_boss(self):
        self.state = STATE_BOSS
        self.enemies.clear()
        self.enemy_bullets.clear()
        self.spawn_timer = 0
        self.boss = Boss()

    def handle_debug_keys(self, event):
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_c:
                self.debug_collision = not self.debug_collision
            if event.key == pygame.K_LEFTBRACKET:
                self.bell_drop_rate = clamp(self.bell_drop_rate - 0.05, 0.0, 1.0)
            if event.key == pygame.K_RIGHTBRACKET:
                self.bell_drop_rate = clamp(self.bell_drop_rate + 0.05, 0.0, 1.0)
            if event.key == pygame.K_b and self.state in (STATE_PLAYING, STATE_BOSS):
                self.start_boss()
            if event.key == pygame.K_m:
                if self.player.invincible_charges > 0 and self.player.invincible_timer == 0:
                    self.player.invincible_charges -= 1
                    self.player.invincible_timer = FPS * 5

    def update(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            self.handle_debug_keys(event)
            if event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                if self.state in (STATE_GAMEOVER, STATE_CLEAR):
                    self.reset()

        if self.state in (STATE_GAMEOVER, STATE_CLEAR):
            return

        self.player.update(self)

        if self.state == STATE_PLAYING:
            self.update_playing()
        elif self.state == STATE_BOSS:
            self.update_boss()

        if self.state == STATE_BOSS and self.boss:
            self.boss.update(self)

        for e in self.enemies:
            e.update(self)
        for b in self.player_bullets:
            b.update(self)
        for b in self.enemy_bullets:
            b.update(self)
        for bell in self.bells:
            bell.update(self)

        self.handle_collisions()

        self.enemies = [e for e in self.enemies if e.alive]
        self.player_bullets = [b for b in self.player_bullets if b.alive]
        self.enemy_bullets = [b for b in self.enemy_bullets if b.alive]
        self.bells = [b for b in self.bells if b.alive]
        if self.boss and not self.boss.alive:
            self.boss = None

    def handle_collisions(self):
        # Player bullets vs enemies/boss/bells
        for pb in self.player_bullets:
            if not pb.alive:
                continue
            for e in self.enemies:
                if e.alive and self.circle_hit(pb, e):
                    pb.alive = False
                    e.take_damage(1, self)
                    break
            if self.boss and self.boss.alive and pb.alive and self.circle_hit(pb, self.boss):
                pb.alive = False
                self.boss.take_damage(1, self)
            if pb.alive:
                for bell in self.bells:
                    if bell.alive and self.circle_hit(pb, bell):
                        pb.alive = False
                        bell.cycle()
                        break

        # Player vs enemies/enemy bullets/bells
        for eb in self.enemy_bullets:
            if eb.alive and self.circle_hit(eb, self.player):
                eb.alive = False
                if self.player.invincible_timer > 0:
                    continue
                if self.player.shield > 0:
                    self.player.shield -= 1
                else:
                    self.player.hit(self)

        for e in self.enemies:
            if e.alive and self.circle_hit(e, self.player):
                e.alive = False
                self.player.hit(self)

        if self.boss and self.boss.alive and self.circle_hit(self.boss, self.player):
            self.player.hit(self)

        for bell in self.bells:
            if bell.alive and self.circle_hit(bell, self.player):
                bell.alive = False
                bell.apply(self.player)

    def circle_hit(self, a, b):
        dx = a.x - b.x
        dy = a.y - b.y
        r = a.r + b.r
        return dx * dx + dy * dy <= r * r

    def draw_ui(self, surf):
        score_txt = self.font.render(f"SCORE {self.score}", True, WHITE)
        lives_txt = self.font.render(f"LIFE {self.player.lives}", True, WHITE)
        bell_txt = self.font.render(f"BELL {int(self.bell_drop_rate * 100)}%", True, WHITE)
        surf.blit(score_txt, (6, 4))
        surf.blit(lives_txt, (6, 18))
        surf.blit(bell_txt, (6, 32))
        if self.player.spread:
            surf.blit(self.font.render("SPREAD", True, WHITE), (6, 46))
        if self.player.shot_interval < 6:
            surf.blit(self.font.render("RAPID", True, WHITE), (6, 60))
        if self.player.score_mult > 1:
            surf.blit(self.font.render(f"X{self.player.score_mult}", True, WHITE), (6, 74))
        if self.player.reflect:
            surf.blit(self.font.render("REFLECT", True, WHITE), (6, 88))
        if self.player.shield > 0:
            surf.blit(self.font.render(f"SHIELD {self.player.shield}", True, WHITE), (6, 102))
        if self.player.invincible_charges > 0:
            surf.blit(self.font.render(f"INV {self.player.invincible_charges} (M)", True, WHITE), (6, 116))
        if self.player.invincible_timer > 0:
            surf.blit(self.font.render("INVINCIBLE", True, WHITE), (6, 130))

        state_txt = ""
        if self.state == STATE_GAMEOVER:
            state_txt = "GAME OVER - R to Retry"
        elif self.state == STATE_CLEAR:
            state_txt = "CLEAR! - R to Retry"
        if state_txt:
            t = self.big_font.render(state_txt, True, WHITE)
            surf.blit(t, (LOGICAL_W / 2 - t.get_width() / 2, LOGICAL_H / 2 - 16))
            if self.state == STATE_CLEAR:
                s = self.font.render(f"FINAL SCORE {self.score}", True, WHITE)
                surf.blit(s, (LOGICAL_W / 2 - s.get_width() / 2, LOGICAL_H / 2 + 6))

    def draw(self):
        self.surface.fill(BLACK)
        self.player.draw(self.surface, self.debug_collision)
        for e in self.enemies:
            e.draw(self.surface, self.debug_collision)
        for b in self.player_bullets:
            b.draw(self.surface, self.debug_collision)
        for b in self.enemy_bullets:
            b.draw(self.surface, self.debug_collision)
        for bell in self.bells:
            bell.draw(self.surface, self.debug_collision)
        if self.boss:
            self.boss.draw(self.surface, self.debug_collision)
            hp_txt = self.font.render(f"BOSS {self.boss.hp}", True, WHITE)
            self.surface.blit(hp_txt, (LOGICAL_W - 70, 4))

        self.draw_ui(self.surface)

        scaled = pygame.transform.scale(self.surface, (LOGICAL_W * self.scale, LOGICAL_H * self.scale))
        self.screen.blit(scaled, (0, 0))
        pygame.display.flip()

    def run(self):
        while True:
            self.clock.tick(FPS)
            self.update()
            self.draw()


def pick_scale():
    info = pygame.display.Info()
    max_scale_w = max(1, info.current_w // LOGICAL_W)
    max_scale_h = max(1, info.current_h // LOGICAL_H)
    return max(1, min(max_scale_w, max_scale_h, 4))


def main():
    pygame.init()
    pygame.mixer.init()
    pygame.key.stop_text_input()
    pygame.event.set_blocked(pygame.TEXTINPUT)
    pygame.event.set_blocked(pygame.TEXTEDITING)
    scale = pick_scale()
    screen = pygame.display.set_mode((LOGICAL_W * scale, LOGICAL_H * scale))
    pygame.display.set_caption("Vertical STG MVP")
    bgm_path = os.path.join(os.path.dirname(__file__), "stage1.mp3")
    if os.path.exists(bgm_path):
        pygame.mixer.music.load(bgm_path)
        pygame.mixer.music.play(-1)
    game = Game(screen, scale)
    game.run()


if __name__ == "__main__":
    main()
