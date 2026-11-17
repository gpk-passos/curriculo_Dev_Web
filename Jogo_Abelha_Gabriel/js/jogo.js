var pincel = document.getElementById("canvas").getContext("2d");

// instancias dos obj
var bg = new Bg(0, 0, 900, 720, "img/bg.png");
var bg2 = new Bg(0, -720, 900, 720, "img/bg.png");
var flor = new Flor(300, -200, 50, 50, "img/flower1.png");
// Alturas seguem a proporção dos sprites (70x58 e 79x89), para não deformar os desenhos
var abelha = new Abelha(400, 580, 100, 83, "img/bee1.png");
var aranha = new Aranha(100, -50, 90, 101, "img/spider1.png");

// tamanho canvas
var telaStart = new Obj(0, 0, 900, 720, "img/start.png");
var telaGameOver = new Obj(0, 0, 900, 720, "img/gameover.png");
var telaYouWin = new Obj(0, 0, 900, 720, "img/youwin.png");

// instancia texto
var placar = new Text();

// efeito sonoro e musica
var somColeta = new Som("som/coleta.mp3");
var somColisao = new Som("som/colisao.mp3");
var somGameOver = new Som("som/gameover.mp3");
var somVitoria = new Som("som/vitoria.mp3");
var musicaStart = new Som("som/musica_start.mp3", true, 0.5);
var musicaJogo = new Som("som/musica_jogo.mp3", true, 0.4);

// carrega todas as imagens antes de precisar delas
["bg", "start", "gameover", "youwin"].forEach(function (nome) { carregaImagem("img/" + nome + ".png"); });
for (var i = 1; i <= 4; i++) {
    carregaImagem("img/bee" + i + ".png");
    carregaImagem("img/spider" + i + ".png");
    carregaImagem("img/flower" + i + ".png");
}

// regras e tempo
var statusJogo = "start";
var play = false;
var metaFlores = 10;
var vidasIniciais = 3;
var tempoInicial = 30;
var tempo = tempoInicial;
var ticks = 0;
var PASSOS_POR_SEGUNDO = 100; // a lógica roda em passos fixos de 10 ms

document.addEventListener("click", function () {
    if (statusJogo === "start" && musicaStart.audio.paused) {
        musicaStart.play();
    }
});

// começa uma partida do zero (usada na primeira vez e ao jogar de novo)
function novaPartida() {
    abelha.lifes = vidasIniciais;
    abelha.floresColetadas = 0;
    abelha.x = 400;
    tempo = tempoInicial;
    ticks = 0;
    aranha.mudaPosicao();
    flor.x = 300;
    flor.y = -200;
    atualizaDirecao();

    somGameOver.stop();
    somVitoria.stop();
    musicaStart.stop();
    statusJogo = "jogando";
    play = true;
    musicaJogo.play();
}

// controle movimento: guarda quais teclas estão pressionadas,
// assim soltar uma tecla não cancela a outra que continua apertada
var teclas = { esquerda: false, direita: false };

function atualizaDirecao() {
    abelha.dir = (teclas.direita ? 12 : 0) + (teclas.esquerda ? -12 : 0);
}

function tecla(event) {
    var k = event.key.toLowerCase(); // funciona com Caps Lock e Shift
    if (k === "d" || k === "arrowright" || event.code === "KeyD") { return "direita"; }
    if (k === "a" || k === "arrowleft" || event.code === "KeyA") { return "esquerda"; }
    return null;
}

document.addEventListener("keydown", function (event) {
    var movimento = tecla(event);
    if (movimento) {
        event.preventDefault(); // evita rolar a página com as setas
        teclas[movimento] = true;
        atualizaDirecao();
    }

    if (event.key === "Enter" && !event.repeat &&
        (statusJogo === "start" || statusJogo === "perdeu" || statusJogo === "ganhou")) {
        novaPartida();
    }
});

document.addEventListener("keyup", function (event) {
    var movimento = tecla(event);
    if (movimento) {
        teclas[movimento] = false;
        atualizaDirecao();
    }
});

// se a janela perder o foco com a tecla apertada, o keyup nunca chega: solta tudo
window.addEventListener("blur", function () {
    teclas.esquerda = false;
    teclas.direita = false;
    atualizaDirecao();
});

// colisão
function collides() {
    if (abelha.collide(aranha)) {
        aranha.mudaPosicao();
        abelha.lifes -= 1;
        somColisao.play();
    }
    if (abelha.collide(flor)) {
        flor.mudaPosicao();
        abelha.floresColetadas += 1;
        somColeta.play();
    }
}

// temporizador
function atualizaTemporizador() {
    ticks++;
    if (ticks >= PASSOS_POR_SEGUNDO) {
        tempo -= 1;
        ticks = 0;
    }
}

function gameover() {
    if (abelha.lifes <= 0 || (tempo <= 0 && abelha.floresColetadas < metaFlores)) {
        if (play === true) {
            play = false;
            statusJogo = "perdeu";
            musicaJogo.stop();
            somGameOver.play();
        }
    }
    else if (abelha.floresColetadas >= metaFlores) {
        if (play === true) {
            play = false;
            statusJogo = "ganhou";
            musicaJogo.stop();
            somVitoria.play();
        }
    }
}

// render da tela
function draw() {
    bg.desenha();
    bg2.desenha();

    if (statusJogo === "start") {
        telaStart.desenhaTela();
    }
    else if (statusJogo === "jogando") {
        aranha.desenha();
        abelha.desenha();
        flor.desenha();

        placar.draw("Vidas: " + abelha.lifes, 20, 50);
        placar.draw("Flores: " + abelha.floresColetadas + " / " + metaFlores, 450, 50, undefined, "center");
        placar.draw("Tempo: " + Math.max(tempo, 0) + "s", 880, 50, undefined, "right");
    }
    else if (statusJogo === "perdeu") {
        telaGameOver.desenhaTela();
        placar.draw("Pressione Enter para jogar de novo", 450, 690, undefined, "center");
    }
    else if (statusJogo === "ganhou") {
        telaYouWin.desenhaTela();
        placar.draw("Pressione Enter para jogar de novo", 450, 690, undefined, "center");
    }
}

// att fisica e logica
function update() {
    if (play) {
        bg.move(4);
        bg2.move(4);

        abelha.move();
        abelha.animation("bee");

        aranha.move();
        aranha.animation("spider");

        flor.move();
        flor.animation("flower");

        collides();
        atualizaTemporizador();
        gameover();
    }
}

// Laço principal: a lógica avança em passos fixos de 10 ms (como o antigo setInterval),
// mas sincronizada com o relógio real. Assim, os 30 segundos são 30 segundos de verdade
// e o jogo pausa sozinho quando a aba fica escondida.
var PASSO_MS = 10;
var ultimoInstante = null;
var acumulado = 0;

function main(agora) {
    if (ultimoInstante === null) { ultimoInstante = agora; }
    acumulado += Math.min(agora - ultimoInstante, 250); // limita o "tirar atraso" depois de travar
    ultimoInstante = agora;

    while (acumulado >= PASSO_MS) {
        update();
        acumulado -= PASSO_MS;
    }

    pincel.clearRect(0, 0, 900, 720);
    draw();
    requestAnimationFrame(main);
}

requestAnimationFrame(main);
