
var tela = document.querySelector("canvas");
var pincel = tela.getContext("2d");

var estadoJogo = 0;
var pontosParaVencer = 5;
var pts1 = 0;
var pts2 = 0;
var fonteRetro = "bold 40px 'Courier New', Courier, monospace";

var jogador1 = { px: 80, py: 310, tx: 25, ty: 100, dir: 0 };
var jogador2 = { px: 1175, py: 310, tx: 25, ty: 100, dir: 0 };
var bolinha = { px: 1280 / 2 - 12, py: 720 / 2 - 12, tx: 25, ty: 25, dir: 8, diry: 5 };

document.addEventListener("keydown", function (e) {
    if (e.keyCode === 87) { jogador1.dir = -12; }
    if (e.keyCode === 83) { jogador1.dir = 12; }
    if (e.keyCode === 38) { jogador2.dir = -12; }
    if (e.keyCode === 40) { jogador2.dir = 12; }

    if (e.keyCode === 32) {
        if (estadoJogo === 0 || estadoJogo === 2) {
            ReiniciarPartida();
        }
    }
});

document.addEventListener("keyup", function (e) {
    if (e.keyCode === 87 || e.keyCode === 83) { jogador1.dir = 0; }
    if (e.keyCode === 38 || e.keyCode === 40) { jogador2.dir = 0; }
});


function Main() {
    pincel.fillStyle = "#000000";
    pincel.fillRect(0, 0, 1280, 720);

    if (estadoJogo === 0) {
        DesenharTelaInicial();
    } else if (estadoJogo === 1) {
        DesenharElementos();
        MovimentarJogadores();
        MovimentarBolinha();
        VerificarColisoes();
        VerificarVitoria();
    } else if (estadoJogo === 2) {
        ApresentarTelaFinal();
    }

    requestAnimationFrame(Main);
}
Main(); 


function DesenharTelaInicial() {
    pincel.fillStyle = "#ffffff";
    pincel.textAlign = "center";
    pincel.font = "bold 100px 'Courier New', Courier, monospace";
    pincel.fillText("PONG", 1280 / 2, 300);
    pincel.font = fonteRetro;
    pincel.fillText("PRESSIONE [ESPACO] PARA INICIAR", 1280 / 2, 450);
}

// Tela
function DesenharElementos() {
    pincel.fillStyle = "#ffffff";
    
    pincel.fillRect(jogador1.px, jogador1.py, jogador1.tx, jogador1.ty);
    pincel.fillRect(jogador2.px, jogador2.py, jogador2.tx, jogador2.ty);
    pincel.fillRect(bolinha.px, bolinha.py, bolinha.tx, bolinha.ty);

    for(let i = 20; i < 720; i += 60) {
        pincel.fillRect(1280/2 - 5, i, 10, 30);
    }

    pincel.textAlign = "center";
    pincel.font = "bold 80px 'Courier New', Courier, monospace";
    pincel.fillText(pts1, 320, 100);
    pincel.fillText(pts2, 960, 100);
}

// move a raquete
function MovimentarJogadores() {
    jogador1.py += jogador1.dir;
    if (jogador1.py < 0) jogador1.py = 0;
    if (jogador1.py > 720 - jogador1.ty) jogador1.py = 720 - jogador1.ty;

    jogador2.py += jogador2.dir;
    if (jogador2.py < 0) jogador2.py = 0;
    if (jogador2.py > 720 - jogador2.ty) jogador2.py = 720 - jogador2.ty;
}

// Faz a bola andar
function MovimentarBolinha() {
    bolinha.px += bolinha.dir;
    bolinha.py += bolinha.diry;

    if (bolinha.py <= 0 || bolinha.py + bolinha.ty >= 720) {
        bolinha.diry *= -1;
    }

    if (bolinha.px < 0) AtualizarPontuacao(2);
    else if (bolinha.px + bolinha.tx > 1280) AtualizarPontuacao(1);
}

// Colisão
function VerificarColisoes() {
    var limite = 25; 

    if (bolinha.px <= jogador1.px + jogador1.tx && bolinha.px + bolinha.tx >= jogador1.px && bolinha.py + bolinha.ty >= jogador1.py && bolinha.py <= jogador1.py + jogador1.ty) {
        bolinha.px = jogador1.px + jogador1.tx; 
        bolinha.dir *= Math.abs(bolinha.dir) < limite ? -1.1 : -1;
        bolinha.diry = ((bolinha.py + (bolinha.ty / 2)) - (jogador1.py + (jogador1.ty / 2))) * 0.15;
    }

    if (bolinha.px + bolinha.tx >= jogador2.px && bolinha.px <= jogador2.px + jogador2.tx && bolinha.py + bolinha.ty >= jogador2.py && bolinha.py <= jogador2.py + jogador2.ty) {
        bolinha.px = jogador2.px - bolinha.tx; 
        bolinha.dir *= Math.abs(bolinha.dir) < limite ? -1.1 : -1;
        bolinha.diry = ((bolinha.py + (bolinha.ty / 2)) - (jogador2.py + (jogador2.ty / 2))) * 0.15;
    }
}

// Ponto e inicia a bola
function AtualizarPontuacao(jogador) {
    if (jogador === 1) pts1++;
    else pts2++;

    bolinha.px = 1280 / 2 - 12;
    bolinha.py = 720 / 2 - 12;
    bolinha.dir = Math.random() > 0.5 ? 8 : -8;
    bolinha.diry = (Math.random() * 6) - 3; 
}

// Ve se alguem ganhou
function VerificarVitoria() {
    if (pts1 >= pontosParaVencer || pts2 >= pontosParaVencer) {
        estadoJogo = 2; 
    }
}

// Mostra a tela de fim
function ApresentarTelaFinal() {
    pincel.fillStyle = "#ffffff";
    pincel.textAlign = "center";
    
    pincel.font = "bold 80px 'Courier New', Courier, monospace";
    pincel.fillText("GAME OVER", 1280 / 2, 200);

    var vencedor = pts1 >= pontosParaVencer ? "JOGADOR 1" : "JOGADOR 2";

    pincel.font = fonteRetro;
    pincel.fillText("VENCEDOR: " + vencedor, 1280 / 2, 350);
    pincel.fillText("SCORE: " + pts1 + " - " + pts2, 1280 / 2, 420);
    pincel.fillText("PRESSIONE [ESPACO] PARA REINICIAR", 1280 / 2, 600);
}

// Zera tudo 
function ReiniciarPartida() {
    pts1 = 0;
    pts2 = 0;
    jogador1.py = 310;
    jogador2.py = 310;
    
    bolinha.px = 1280 / 2 - 12;
    bolinha.py = 720 / 2 - 12;
    bolinha.dir = Math.random() > 0.5 ? 8 : -8;
    bolinha.diry = (Math.random() * 6) - 3; 
    
    estadoJogo = 1; 
}