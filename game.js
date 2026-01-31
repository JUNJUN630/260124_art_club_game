(() => {
  "use strict";

  const LOGICAL_W = 320;
  const LOGICAL_H = 288;
  const FPS = 30;
  const STEP_MS = 1000 / FPS;

  const COLORS = {
    WHITE: "rgb(240,240,240)",
    BLACK: "rgb(20,20,20)",
    RED: "rgb(220,80,80)",
    GREEN: "rgb(80,220,120)",
    BLUE: "rgb(80,140,220)",
    YELLOW: "rgb(230,210,80)",
    MAGENTA: "rgb(220,100,200)",
    CYAN: "rgb(80,220,220)",
    ORANGE: "rgb(255,140,0)",
    PURPLE: "rgb(160,120,220)",
    SILVER: "rgb(200,200,220)",
  };

  const STATE_PLAYING = "PLAYING";
  const STATE_BOSS = "BOSS";
  const STATE_GAMEOVER = "GAMEOVER";
  const STATE_CLEAR = "CLEAR";

  const BELL_COLORS = [
    COLORS.YELLOW,
    COLORS.MAGENTA,
    COLORS.CYAN,
    COLORS.ORANGE,
    COLORS.PURPLE,
    COLORS.SILVER,
  ];
  const BELL_EFFECTS = [
    "SPREAD",
    "RAPID",
    "SCORE",
    "SHIELD",
    "INVINCIBLE",
    "REFLECT",
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const vecFromAngle = (deg, speed) => {
    const rad = (deg * Math.PI) / 180;
    return { vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed };
  };
  const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

  class Entity {
    constructor(x, y, r) {
      this.x = x;
      this.y = y;
      this.r = r;
      this.alive = true;
    }

    rect() {
      return {
        x: Math.floor(this.x - this.r),
        y: Math.floor(this.y - this.r),
        w: Math.floor(this.r * 2),
        h: Math.floor(this.r * 2),
      };
    }

    update(_game) {}
    draw(_ctx, _debug) {}
  }

  class Player extends Entity {
    constructor(x, y) {
      super(x, y, 6);
      this.speed = 3.0;
      this.lives = 3;
      this.invuln = 0;
      this.invincible_timer = 0;
      this.invincible_charges = 0;
      this.shield = 0;
      this.shot_cd = 0;
      this.shot_interval = 6;
      this.spread = false;
      this.score_mult = 1;
      this.reflect = false;
    }

    update(game) {
      const dx = (game.keys.has("ArrowRight") ? 1 : 0) - (game.keys.has("ArrowLeft") ? 1 : 0);
      const dy = (game.keys.has("ArrowDown") ? 1 : 0) - (game.keys.has("ArrowUp") ? 1 : 0);
      let vx = dx;
      let vy = dy;
      if (vx !== 0 && vy !== 0) {
        vx *= 0.7071;
        vy *= 0.7071;
      }

      this.x += vx * this.speed;
      this.y += vy * this.speed;
      this.x = clamp(this.x, this.r, LOGICAL_W - this.r);
      this.y = clamp(this.y, this.r, LOGICAL_H - this.r);

      if (this.invuln > 0) this.invuln -= 1;
      if (this.invincible_timer > 0) this.invincible_timer -= 1;

      if (this.shot_cd > 0) this.shot_cd -= 1;

      if (game.keys.has("KeyZ") && this.shot_cd === 0) {
        this.fire(game);
        this.shot_cd = this.shot_interval;
      }
    }

    fire(game) {
      const angles = this.spread ? [-90, -120, -60] : [-90];
      for (const ang of angles) {
        const { vx, vy } = vecFromAngle(ang, 6.0);
        if (this.reflect && Math.random() < 0.25) {
          game.playerBullets.push(new ReflectBullet(this.x, this.y - 6, vx, vy, 2));
        } else {
          game.playerBullets.push(new PlayerBullet(this.x, this.y - 6, vx, vy));
        }
      }
    }

    hit(game) {
      if (this.invuln > 0 || this.invincible_timer > 0) return;
      this.lives -= 1;
      this.invuln = FPS;
      if (this.lives <= 0) {
        game.state = STATE_GAMEOVER;
      }
    }

    draw(ctx, debug) {
      let color = COLORS.GREEN;
      if (this.invincible_timer > 0) {
        color = "rgb(120,220,255)";
      } else if (!(this.invuln === 0 || Math.floor(this.invuln / 4) % 2 === 0)) {
        color = "rgb(60,120,60)";
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 8);
      ctx.lineTo(this.x - 6, this.y + 6);
      ctx.lineTo(this.x + 6, this.y + 6);
      ctx.closePath();
      ctx.fill();

      if (debug) {
        drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
      }
    }
  }

  class PlayerBullet extends Entity {
    constructor(x, y, vx, vy) {
      super(x, y, 2);
      this.vx = vx;
      this.vy = vy;
    }

    update(_game) {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10 || this.y > LOGICAL_H + 10 || this.x < -10 || this.x > LOGICAL_W + 10) {
        this.alive = false;
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 2, true, COLORS.WHITE);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class ReflectBullet extends PlayerBullet {
    constructor(x, y, vx, vy, bounces) {
      super(x, y, vx, vy);
      this.bounces_left = bounces;
    }

    update(_game) {
      this.x += this.vx;
      this.y += this.vy;

      let hitWall = false;
      if (this.x - this.r <= 0 || this.x + this.r >= LOGICAL_W) {
        hitWall = true;
        this.vx *= -1;
        this.x = clamp(this.x, this.r, LOGICAL_W - this.r);
      }
      if (this.y - this.r <= 0 || this.y + this.r >= LOGICAL_H) {
        hitWall = true;
        this.vy *= -1;
        this.y = clamp(this.y, this.r, LOGICAL_H - this.r);
      }

      if (hitWall) {
        if (this.bounces_left > 0) {
          this.bounces_left -= 1;
        } else {
          this.alive = false;
        }
      }

      if (this.y < -20 || this.y > LOGICAL_H + 20 || this.x < -20 || this.x > LOGICAL_W + 20) {
        this.alive = false;
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 2, true, COLORS.SILVER);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class EnemyBullet extends Entity {
    constructor(x, y, vx, vy) {
      super(x, y, 3);
      this.vx = vx;
      this.vy = vy;
    }

    update(_game) {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10 || this.y > LOGICAL_H + 10 || this.x < -10 || this.x > LOGICAL_W + 10) {
        this.alive = false;
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 3, true, COLORS.YELLOW);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class ExplodeBullet extends EnemyBullet {
    constructor(x, y, vx, vy, fuseFrames) {
      super(x, y, vx, vy);
      this.fuse = fuseFrames;
    }

    update(game) {
      this.x += this.vx;
      this.y += this.vy;
      this.fuse -= 1;
      if (this.fuse <= 0) {
        this.explode(game);
        this.alive = false;
        return;
      }
      if (this.y < -10 || this.y > LOGICAL_H + 10 || this.x < -10 || this.x > LOGICAL_W + 10) {
        this.alive = false;
      }
    }

    explode(game) {
      const count = 8;
      for (let i = 0; i < count; i += 1) {
        const ang = i * (360 / count);
        const { vx, vy } = vecFromAngle(ang, 2.0);
        game.enemyBullets.push(new EnemyBullet(this.x, this.y, vx, vy));
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 4, true, COLORS.ORANGE);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class Enemy extends Entity {
    constructor(x, y, r, hp, score) {
      super(x, y, r);
      this.hp = hp;
      this.score = score;
      this.shot_timer = randInt(30, 90);
    }

    take_damage(dmg, game) {
      this.hp -= dmg;
      if (this.hp <= 0) {
        this.alive = false;
        game.addScore(this.score);
        if (Math.random() < game.bell_drop_rate) {
          game.bells.push(new Bell(this.x, this.y));
        }
      }
    }

    try_shoot_at_player(game, speed = 2.0) {
      if (this.shot_timer > 0) {
        this.shot_timer -= 1;
        return;
      }
      this.shot_timer = randInt(40, 100);
      const dx = game.player.x - this.x;
      const dy = game.player.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) return;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      game.enemyBullets.push(new EnemyBullet(this.x, this.y, vx, vy));
    }
  }

  class ZigZagEnemy extends Enemy {
    constructor(x, y) {
      super(x, y, 7, 2, 100);
      this.vy = 1.2;
      this.phase = Math.random() * Math.PI * 2;
    }

    update(game) {
      this.y += this.vy;
      this.x += Math.sin(this.y / 18 + this.phase) * 1.3;
      this.try_shoot_at_player(game, 2.0);
      if (this.y > LOGICAL_H + 20) this.alive = false;
    }

    draw(ctx, debug) {
      const r = this.rect();
      ctx.fillStyle = COLORS.BLUE;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class ChargeEnemy extends Enemy {
    constructor(x, y) {
      super(x, y, 7, 2, 120);
      this.vy = 0.8;
      this.charged = false;
      this.vx = 0.0;
    }

    update(game) {
      if (!this.charged && this.y > 60) {
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        const dist = Math.hypot(dx, dy) || 1.0;
        this.vx = (dx / dist) * 4.0;
        this.vy = (dy / dist) * 4.0;
        this.charged = true;
      }
      this.x += this.vx;
      this.y += this.vy;
      this.try_shoot_at_player(game, 2.0);
      if (this.y > LOGICAL_H + 20 || this.x < -20 || this.x > LOGICAL_W + 20) {
        this.alive = false;
      }
    }

    draw(ctx, debug) {
      const r = this.rect();
      ctx.fillStyle = COLORS.RED;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class TankEnemy extends Enemy {
    constructor(x, y) {
      super(x, y, 9, 6, 200);
      this.vy = 0.7;
    }

    update(game) {
      this.y += this.vy;
      this.try_shoot_at_player(game, 1.7);
      if (this.y > LOGICAL_H + 30) this.alive = false;
    }

    draw(ctx, debug) {
      const r = this.rect();
      ctx.fillStyle = "rgb(120,200,120)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class Bell extends Entity {
    constructor(x, y) {
      super(x, y, 6);
      this.color_index = 0;
      this.vy = 1.0;
    }

    update(_game) {
      this.y += this.vy;
      if (this.y > LOGICAL_H + 10) this.alive = false;
    }

    cycle() {
      this.color_index = (this.color_index + 1) % BELL_COLORS.length;
    }

    apply(player) {
      const effect = BELL_EFFECTS[this.color_index];
      if (effect === "SPREAD") {
        player.spread = true;
      } else if (effect === "RAPID") {
        player.shot_interval = Math.max(2, player.shot_interval - 2);
      } else if (effect === "SCORE") {
        player.score_mult = Math.min(4, player.score_mult + 1);
      } else if (effect === "SHIELD") {
        player.shield += 1;
      } else if (effect === "INVINCIBLE") {
        player.invincible_charges += 1;
      } else if (effect === "REFLECT") {
        player.reflect = true;
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 6, true, BELL_COLORS[this.color_index]);
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class Boss extends Entity {
    constructor() {
      super(LOGICAL_W / 2, -30, 16);
      this.hp = 400;
      this.vy = 1.0;
      this.state = "ENTER";
      this.shot_timer = 30;
      this.special_timer = 180;
    }

    update(game) {
      if (this.state === "ENTER") {
        this.y += this.vy;
        if (this.y >= 60) this.state = "FIGHT";
      } else {
        this.x += Math.sin(game.timeMs / 400) * 0.6;
        this.shot_timer -= 1;
        if (this.shot_timer <= 0) {
          this.shot_timer = 30;
          this.fan_shot(game);
        }
        this.special_timer -= 1;
        if (this.special_timer <= 0) {
          this.special_timer = 180;
          this.special_attack(game);
        }
      }
    }

    fan_shot(game) {
      const count = randInt(4, 6);
      const spread = 70;
      const dx = game.player.x - this.x;
      const dy = game.player.y - this.y;
      const base = (Math.atan2(dy, dx) * 180) / Math.PI;
      const start = base - spread / 2;
      const step = spread / (count - 1);
      for (let i = 0; i < count; i += 1) {
        const ang = start + step * i;
        const { vx, vy } = vecFromAngle(ang, 2.2);
        if (Math.random() < 0.1) {
          game.enemyBullets.push(new ExplodeBullet(this.x, this.y, vx, vy, FPS * 3));
        } else {
          game.enemyBullets.push(new EnemyBullet(this.x, this.y, vx, vy));
        }
      }
    }

    special_attack(game) {
      const count = 16;
      for (let i = 0; i < count; i += 1) {
        const ang = i * (360 / count);
        const { vx, vy } = vecFromAngle(ang, 2.0);
        if (Math.random() < 0.1) {
          game.enemyBullets.push(new ExplodeBullet(this.x, this.y, vx, vy, FPS * 3));
        } else {
          game.enemyBullets.push(new EnemyBullet(this.x, this.y, vx, vy));
        }
      }
    }

    take_damage(dmg, game) {
      this.hp -= dmg;
      if (this.hp <= 0) {
        this.alive = false;
        game.state = STATE_CLEAR;
      }
    }

    draw(ctx, debug) {
      drawCircle(ctx, this.x, this.y, 16, true, "rgb(200,120,60)");
      if (debug) drawCircle(ctx, this.x, this.y, this.r, false, COLORS.RED);
    }
  }

  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.scale = 1;
      this.font = "12px Arial";
      this.big_font = "18px Arial";
      this.keys = new Set();
      this.timeMs = 0;
      this.reset();
    }

    reset() {
      this.state = STATE_PLAYING;
      this.player = new Player(LOGICAL_W / 2, LOGICAL_H - 40);
      this.playerBullets = [];
      this.enemyBullets = [];
      this.enemies = [];
      this.bells = [];
      this.boss = null;
      this.score = 0;
      this.spawn_timer = 0;
      this.phase_time = 0;
      this.debug_collision = false;
      this.bell_drop_rate = 0.5;
    }

    addScore(base) {
      this.score += base * this.player.score_mult;
    }

    spawn_enemy() {
      const x = randInt(20, LOGICAL_W - 20);
      const t = Math.random();
      if (t < 0.4) {
        this.enemies.push(new ZigZagEnemy(x, -10));
      } else if (t < 0.75) {
        this.enemies.push(new ChargeEnemy(x, -10));
      } else {
        this.enemies.push(new TankEnemy(x, -10));
      }
    }

    update_playing() {
      this.phase_time += 1;
      if (this.phase_time >= FPS * 60 && this.state === STATE_PLAYING) {
        this.start_boss();
        return;
      }

      this.spawn_timer -= 1;
      if (this.spawn_timer <= 0) {
        this.spawn_timer = randInt(40, 80);
        this.spawn_enemy();
      }
    }

    update_boss() {
      this.spawn_timer -= 1;
      if (this.spawn_timer <= 0) {
        this.spawn_timer = randInt(50, 90);
        this.spawn_enemy();
      }
    }

    start_boss() {
      this.state = STATE_BOSS;
      this.enemies = [];
      this.enemyBullets = [];
      this.spawn_timer = 0;
      this.boss = new Boss();
    }

    handleKeydown(code) {
      if (code === "KeyR") {
        if (this.state === STATE_GAMEOVER || this.state === STATE_CLEAR) {
          this.reset();
        }
      }
      if (code === "KeyC") {
        this.debug_collision = !this.debug_collision;
      }
      if (code === "BracketLeft") {
        this.bell_drop_rate = clamp(this.bell_drop_rate - 0.05, 0.0, 1.0);
      }
      if (code === "BracketRight") {
        this.bell_drop_rate = clamp(this.bell_drop_rate + 0.05, 0.0, 1.0);
      }
      if (code === "KeyB") {
        if (this.state === STATE_PLAYING || this.state === STATE_BOSS) {
          this.start_boss();
        }
      }
      if (code === "KeyM") {
        if (this.player.invincible_charges > 0 && this.player.invincible_timer === 0) {
          this.player.invincible_charges -= 1;
          this.player.invincible_timer = FPS * 5;
        }
      }
    }

    update() {
      if (this.state === STATE_GAMEOVER || this.state === STATE_CLEAR) {
        return;
      }

      this.player.update(this);

      if (this.state === STATE_PLAYING) {
        this.update_playing();
      } else if (this.state === STATE_BOSS) {
        this.update_boss();
      }

      if (this.state === STATE_BOSS && this.boss) {
        this.boss.update(this);
      }

      for (const e of this.enemies) e.update(this);
      for (const b of this.playerBullets) b.update(this);
      for (const b of this.enemyBullets) b.update(this);
      for (const bell of this.bells) bell.update(this);

      this.handleCollisions();

      this.enemies = this.enemies.filter((e) => e.alive);
      this.playerBullets = this.playerBullets.filter((b) => b.alive);
      this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
      this.bells = this.bells.filter((b) => b.alive);
      if (this.boss && !this.boss.alive) this.boss = null;
    }

    handleCollisions() {
      for (const pb of this.playerBullets) {
        if (!pb.alive) continue;
        for (const e of this.enemies) {
          if (e.alive && circleHit(pb, e)) {
            pb.alive = false;
            e.take_damage(1, this);
            break;
          }
        }
        if (this.boss && this.boss.alive && pb.alive && circleHit(pb, this.boss)) {
          pb.alive = false;
          this.boss.take_damage(1, this);
        }
        if (pb.alive) {
          for (const bell of this.bells) {
            if (bell.alive && circleHit(pb, bell)) {
              pb.alive = false;
              bell.cycle();
              break;
            }
          }
        }
      }

      for (const eb of this.enemyBullets) {
        if (eb.alive && circleHit(eb, this.player)) {
          eb.alive = false;
          if (this.player.invincible_timer > 0) continue;
          if (this.player.shield > 0) {
            this.player.shield -= 1;
          } else {
            this.player.hit(this);
          }
        }
      }

      for (const e of this.enemies) {
        if (e.alive && circleHit(e, this.player)) {
          e.alive = false;
          this.player.hit(this);
        }
      }

      if (this.boss && this.boss.alive && circleHit(this.boss, this.player)) {
        this.player.hit(this);
      }

      for (const bell of this.bells) {
        if (bell.alive && circleHit(bell, this.player)) {
          bell.alive = false;
          bell.apply(this.player);
        }
      }
    }

    drawUI() {
      const ctx = this.ctx;
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = this.font;
      ctx.fillText(`SCORE ${this.score}`, 6, 14);
      ctx.fillText(`LIFE ${this.player.lives}`, 6, 28);
      ctx.fillText(`BELL ${Math.floor(this.bell_drop_rate * 100)}%`, 6, 42);

      let y = 56;
      if (this.player.spread) {
        ctx.fillText("SPREAD", 6, y);
        y += 14;
      }
      if (this.player.shot_interval < 6) {
        ctx.fillText("RAPID", 6, y);
        y += 14;
      }
      if (this.player.score_mult > 1) {
        ctx.fillText(`X${this.player.score_mult}`, 6, y);
        y += 14;
      }
      if (this.player.reflect) {
        ctx.fillText("REFLECT", 6, y);
        y += 14;
      }
      if (this.player.shield > 0) {
        ctx.fillText(`SHIELD ${this.player.shield}`, 6, y);
        y += 14;
      }
      if (this.player.invincible_charges > 0) {
        ctx.fillText(`INV ${this.player.invincible_charges} (M)`, 6, y);
        y += 14;
      }
      if (this.player.invincible_timer > 0) {
        ctx.fillText("INVINCIBLE", 6, y);
      }

      let stateTxt = "";
      if (this.state === STATE_GAMEOVER) stateTxt = "GAME OVER - R to Retry";
      if (this.state === STATE_CLEAR) stateTxt = "CLEAR! - R to Retry";
      if (stateTxt) {
        ctx.font = this.big_font;
        drawCenteredText(ctx, stateTxt, LOGICAL_H / 2 - 16);
        if (this.state === STATE_CLEAR) {
          ctx.font = this.font;
          drawCenteredText(ctx, `FINAL SCORE ${this.score}`, LOGICAL_H / 2 + 6);
        }
      }
    }

    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = COLORS.BLACK;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      this.player.draw(ctx, this.debug_collision);
      for (const e of this.enemies) e.draw(ctx, this.debug_collision);
      for (const b of this.playerBullets) b.draw(ctx, this.debug_collision);
      for (const b of this.enemyBullets) b.draw(ctx, this.debug_collision);
      for (const bell of this.bells) bell.draw(ctx, this.debug_collision);
      if (this.boss) {
        this.boss.draw(ctx, this.debug_collision);
        ctx.fillStyle = COLORS.WHITE;
        ctx.font = this.font;
        ctx.fillText(`BOSS ${this.boss.hp}`, LOGICAL_W - 70, 14);
      }

      this.drawUI();
    }
  }

  const circleHit = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const r = a.r + b.r;
    return dx * dx + dy * dy <= r * r;
  };

  const drawCircle = (ctx, x, y, r, filled, color) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  };

  const drawCenteredText = (ctx, text, y) => {
    const width = ctx.measureText(text).width;
    ctx.fillText(text, LOGICAL_W / 2 - width / 2, y);
  };

  const canvas = document.getElementById("game");
  const overlay = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const game = new Game(ctx);

  const bgm = new Audio("stage1.mp3");
  bgm.loop = true;
  bgm.preload = "auto";

  let audioUnlocked = false;
  const tryStartAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    bgm.play().catch(() => {
      audioUnlocked = false;
    });
  };

  const hideOverlay = () => {
    if (overlay) overlay.classList.add("hidden");
  };

  const onFirstInteraction = () => {
    tryStartAudio();
    hideOverlay();
  };

  if (overlay) {
    overlay.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        onFirstInteraction();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyZ",
        "KeyR",
        "KeyC",
        "KeyB",
        "KeyM",
        "BracketLeft",
        "BracketRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
    }

    onFirstInteraction();

    if (!e.repeat) {
      game.handleKeydown(e.code);
    }

    game.keys.add(e.code);
  });

  window.addEventListener("keyup", (e) => {
    game.keys.delete(e.code);
  });

  window.addEventListener("blur", () => {
    game.keys.clear();
  });

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const maxScaleW = Math.max(1, Math.floor((window.innerWidth - 40) / LOGICAL_W));
    const maxScaleH = Math.max(1, Math.floor((window.innerHeight - 140) / LOGICAL_H));
    const scale = Math.max(1, Math.min(maxScaleW, maxScaleH, 4));
    game.scale = scale;

    canvas.width = Math.floor(LOGICAL_W * scale * dpr);
    canvas.height = Math.floor(LOGICAL_H * scale * dpr);
    canvas.style.width = `${LOGICAL_W * scale}px`;
    canvas.style.height = `${LOGICAL_H * scale}px`;

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  };

  resize();
  window.addEventListener("resize", resize);

  let lastTime = performance.now();
  let accumulator = 0;

  const loop = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    accumulator += delta;
    if (accumulator > STEP_MS * 5) accumulator = STEP_MS * 5;

    while (accumulator >= STEP_MS) {
      game.timeMs += STEP_MS;
      game.update();
      accumulator -= STEP_MS;
    }

    game.draw();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
})();
