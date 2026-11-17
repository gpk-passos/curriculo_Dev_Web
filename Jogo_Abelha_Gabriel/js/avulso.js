// Cache de imagens: cada arquivo é carregado uma única vez.
// (Antes, uma nova Image era criada a cada desenho, o que podia fazer o sprite piscar.)
var cacheImagens = {};

function carregaImagem(src) {
    if (!cacheImagens[src]) {
        var img = new Image();
        img.src = src;
        cacheImagens[src] = img;
    }
    return cacheImagens[src];
}

function imagemPronta(img) {
    return img.complete && img.naturalWidth > 0;
}

class Obj {
    frame = 1;
    timer = 0;

    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    desenha() {
        var img = carregaImagem(this.color);
        if (!imagemPronta(img)) { return; }
        pincel.drawImage(img, this.x, this.y, this.width, this.height);
    }

    // Desenha a imagem inteira, centralizada e sem distorcer (telas de início, vitória e derrota)
    desenhaTela() {
        var img = carregaImagem(this.color);
        if (!imagemPronta(img)) { return; }
        var escala = Math.min(this.width / img.naturalWidth, this.height / img.naturalHeight);
        var w = img.naturalWidth * escala;
        var h = img.naturalHeight * escala;
        pincel.drawImage(img, this.x + (this.width - w) / 2, this.y + (this.height - h) / 2, w, h);
    }

    animation(name) {
        this.timer += 1;
        if (this.timer > 10) {
            this.timer = 0;
            this.frame += 1;
            if (this.frame > 4) {
                this.frame = 1;
            }
        }
        this.color = "img/" + name + this.frame + ".png";
    }
}

class Abelha extends Obj {
    dir = 0;
    lifes = 3;
    floresColetadas = 0;

    move() {
        this.x += this.dir;

        // Limites da tela
        var limite = pincel.canvas.width - this.width;
        if (this.x < 0) { this.x = 0; }
        if (this.x > limite) { this.x = limite; }
    }

    // A caixa de colisão é um pouco menor que a imagem (margem),
    // para não contar batida nos cantos transparentes dos sprites
    collide(obj, margem = 10) {
        if (this.x + margem < obj.x + obj.width - margem &&
            this.x + this.width - margem > obj.x + margem &&
            this.y + margem < obj.y + obj.height - margem &&
            this.y + this.height - margem > obj.y + margem) {
            return true;
        } else {
            return false;
        }
    }
}

class Aranha extends Obj {
    move() {
        this.y += 6;
        if (this.y > 900) {
            this.mudaPosicao();
        }
    }

    mudaPosicao() {
        this.y = -50;
        this.x = Math.random() * (pincel.canvas.width - this.width);
    }
}


class Flor extends Obj {
    move() {
        this.y += 4;
        if (this.y > 900) {
            this.mudaPosicao();
        }
    }

    mudaPosicao() {
        this.y = Math.random() * (-800 - (-50)) + (-50);
        this.x = Math.random() * (pincel.canvas.width - this.width);
    }
}

class Bg extends Obj {
    // Repete a imagem na horizontal mantendo a proporção original
    // (a arte é 360x640 e o canvas é mais largo, então esticar deformava os desenhos)
    desenha() {
        var img = carregaImagem(this.color);
        if (!imagemPronta(img)) { return; }
        var larguraTile = this.height * img.naturalWidth / img.naturalHeight;
        for (var x = this.x; x < this.x + this.width; x += larguraTile) {
            pincel.drawImage(img, x, this.y, larguraTile, this.height);
        }
    }

    // Quando sai da tela, volta para cima da outra imagem sem perder o excesso
    // (antes, o valor era zerado e o fundo dava um pequeno salto a cada volta)
    move(speed) {
        this.y += speed;
        if (this.y >= this.height) {
            this.y -= this.height * 2;
        }
    }
}

class Text {
    draw(texto, x, y, cor = "#5B3F3A", alinhamento = "left") {
        pincel.font = "bold 25px Arial";
        pincel.fillStyle = cor;
        pincel.textAlign = alinhamento;
        pincel.fillText(texto, x, y);
        pincel.textAlign = "left";
    }
}

class Som {
    constructor(src, loop = false, volume = 1.0) {
        this.audio = new Audio(src);
        this.audio.loop = loop;
        this.audio.volume = volume;
    }

    play() {
        this.audio.currentTime = 0;
        // O navegador pode bloquear o som antes de o jogador interagir; isso não pode quebrar o jogo
        var promessa = this.audio.play();
        if (promessa && promessa.catch) { promessa.catch(function () { }); }
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
    }
}
