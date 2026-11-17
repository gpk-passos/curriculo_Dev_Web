var pincel = document.getElementById("canvas").getContext("2d");

// instancias dos obj
var bg = new Bg(0, 0, 900, 720, "img/bg.png");
var bg2 = new Bg(0, -720, 900, 720, "img/bg.png");
var flor = new Flor(300, -200, 50, 50, "img/flower1.png");
var abelha = new Abelha(400, 580, 100, 100, "img/bee1.png");
var aranha = new Aranha(100, -50, 100, 100, "img/spider1.png");

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

// regras e tempo
var statusJogo = "start"; 
var play = false;
var metaFlores = 10;
var tempo = 30;      
var ticks = 0;       


document.addEventListener("click", function() {
    if (statusJogo === "start" && musicaStart.audio.paused) {
        musicaStart.play();
    }
});

// controle movimento
document.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && statusJogo === "start") {
        statusJogo = "jogando";
        play = true;
        
        musicaStart.stop(); 
        musicaJogo.play();  
    }
    
    if (play) {
        if (event.key === "d" || event.key === "ArrowRight") { abelha.dir = 12; }
        if (event.key === "a" || event.key === "ArrowLeft") { abelha.dir = -12; }
    }
});

document.addEventListener("keyup", function(event) {
    if (event.key === "d" || event.key === "a" || event.key === "ArrowRight" || event.key === "ArrowLeft") {
        abelha.dir = 0;
    }
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
    if (ticks >= 100) {
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
        telaStart.desenha();
    } 
    else if (statusJogo === "jogando") {
        aranha.desenha();
        abelha.desenha();
        flor.desenha();
        
        placar.draw("Vidas: " + abelha.lifes, 20, 50);
        placar.draw("Flores: " + abelha.floresColetadas + " / " + metaFlores, 350, 50);
        placar.draw("Tempo: " + tempo + "s", 720, 50);
    } 
    else if (statusJogo === "perdeu") {
        telaGameOver.desenha();
    } 
    else if (statusJogo === "ganhou") {
        telaYouWin.desenha();
    }
}

// att fisica e logica 
function update() {
    if (play) {
        bg.move(4, 720, 0);
        bg2.move(4, 0, -720);
        
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

function main() {
    pincel.clearRect(0, 0, 900, 720);
    update();
    draw();
}

setInterval(main, 10);