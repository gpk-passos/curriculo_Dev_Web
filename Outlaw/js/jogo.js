/* =====================================================================
   OUTLAW 3D - regras do jogo
   Mesma organização do "Jogo da Abelha": instâncias dos objetos, teclado,
   colisões, update() para a lógica, draw() para o desenho e main() no laço.
   O desenho agora tem duas camadas: o mundo 3D (pincel, um Pincel3D do
   motor3d.js) e, por cima, o placar e as letras (pincel2d, no canvas do HUD).
   ===================================================================== */

var canvas3d = document.getElementById("tela3d");
var pincel = new Pincel3D(canvas3d);
var hud = document.getElementById("hud");
var pincel2d = hud.getContext("2d");
var palco = document.getElementById("palco");      // o que vai para a tela cheia

// ----- instâncias dos objetos -----
var cenario = new Cenario(PALETAS.cacto);

// os dois começam na mesma profundidade, no meio da rua, cada um perto da sua lateral
var X_INICIAL = 96;
var Z_INICIAL = (CAMPO.fundo + CAMPO.frente) / 2 - PROF_PISTOLEIRO / 2;

var jogador1 = new Pistoleiro(X_INICIAL, Z_INICIAL, CORES.jogador1, CORES.jogador1Escuro, 1, "LARANJA", {
    cima: "KeyW", baixo: "KeyS", esquerda: "KeyA", direita: "KeyD",
    tiro: ["KeyF", "Space"]
});

var jogador2 = new Pistoleiro(LARGURA - X_INICIAL - 8 * PIXEL_L, Z_INICIAL, CORES.jogador2, CORES.jogador2Escuro, -1, "VERMELHO", {
    cima: "ArrowUp", baixo: "ArrowDown", esquerda: "ArrowLeft", direita: "ArrowRight",
    tiro: ["Enter", "NumpadEnter", "Numpad0"]
});

// a tábua fica onde estaria o meio do jogador 2
var alvo = new Alvo(LARGURA - X_INICIAL - 4 * PIXEL_L - PIXEL_L, CAMPO.fundo);

var obstaculos = [new Cacto(), new Diligencia(), new Muro()];
var obstaculo = obstaculos[0];

// os bonecos de voxels são montados uma vez só, aqui no começo
jogador1.preparaMalhas();
jogador2.preparaMalhas();
alvo.preparaMalha();

// a cidade de cada cenário também (assim trocar no menu não engasga)
cenario.defineTema(PALETAS.diligencia);
cenario.defineTema(PALETAS.muro);

// Partículas: todas criadas agora e reaproveitadas em roda. Durante a
// partida nenhuma é criada nem jogada fora.
var TOTAL_PARTICULAS = 600;
var particulas = [];
for (var i = 0; i < TOTAL_PARTICULAS; i++) {
    particulas.push(new Particula());
}
var proximaParticula = 0;

// clarões (brilhos rápidos: tiro, ricochete, bala no obstáculo), também reaproveitados
var TOTAL_CLAROES = 24;
var claroes = [];
for (var i = 0; i < TOTAL_CLAROES; i++) {
    claroes.push({ x: 0, y: 0, z: 0, tamanho: 0, cor: "#ffffff", vida: 0, vidaTotal: 1 });
}
var proximoClarao = 0;

var camera = new Camera();

// textos
var placar = new Texto(pincel2d);

// posição de cada opção dentro do menu
var OP_MODO = 0;
var OP_CENARIO = 1;
var OP_BARREIRA = 2;
var OP_DEMOLICAO = 3;
var OP_FUGA = 4;
var OP_MUNICAO = 5;
var OP_VITORIA = 6;

var menu = new Menu([
    { nome: "MODO", valores: ["DUELO", "TIRO AO ALVO"], atual: 0 },
    { nome: "CENÁRIO", valores: ["CACTO", "DILIGÊNCIA", "MURO"], atual: 0 },
    { nome: "BARREIRA", valores: ["PARADA", "MÓVEL"], atual: 0 },
    { nome: "DEMOLIÇÃO", valores: ["NÃO", "SIM"], atual: 0 },
    { nome: "FUGA", valores: ["NÃO", "SIM"], atual: 0 },
    { nome: "MUNIÇÃO", valores: ["LIVRE", "SEIS BALAS"], atual: 0 },
    { nome: "VITÓRIA", valores: ["5 PONTOS", "10 PONTOS", "15 PONTOS"], atual: 1 }
], placar);

// Os 16 jogos do cartucho de 1978. A chave junta, na ordem, os valores de
// MODO, CENÁRIO, BARREIRA, DEMOLIÇÃO, FUGA e MUNIÇÃO do menu.
var JOGOS_ORIGINAIS = {
    "000000": 1, "000010": 2, "000100": 3, "000101": 4,
    "010000": 5, "011000": 6, "010100": 7, "011100": 8, "011101": 9,
    "020101": 10, "021100": 11, "021101": 12,
    "100000": 13, "100100": 14, "111000": 15, "111100": 16
};

// efeitos sonoros: [frequência em Hz, duração em segundos, frequência final]
// Cada pistoleiro tem o seu revólver e as suas botas, para dar para saber
// quem atirou e quem está andando sem olhar. O laranja tem um revólver
// pesado, que dá um estrondo grave, e esporas que tilintam a cada passo. O
// vermelho tem um revólver leve, de estalo seco e agudo, e um "toc" de salto.
jogador1.somTiro = new Som([["ruido", 0.30, 2400, 160], [150, 0.20, 40]], 0.22, "triangle", true);
jogador1.somPasso = new Som([["ruido", 0.05, 900, 120], [0, 0.01], [2900, 0.05, 2700]], 0.05, "triangle");
jogador2.somTiro = new Som([["ruido", 0.14, 9000, 1400], [1100, 0.06, 260]], 0.15, "square", true);
jogador2.somPasso = new Som([["ruido", 0.03, 4000, 1200], [300, 0.03, 180]], 0.025, "square", true);

var somRicochete = new Som([[1500, 0.04, 900], [2100, 0.06, 2600]], 0.05);
var somBloco = new Som([[190, 0.09, 70]], 0.14);
var somAcerto = new Som([[659, 0.09], [523, 0.09], [392, 0.09], [262, 0.28, 120]], 0.13);
var somVazio = new Som([[110, 0.04]], 0.10);
var somRecarga = new Som([[330, 0.05], [0, 0.04], [440, 0.05], [0, 0.04], [550, 0.08]], 0.09);
var somMenu = new Som([[880, 0.04]], 0.06);
var somInicio = new Som([[392, 0.10], [523, 0.10], [784, 0.20]], 0.10);
var somFogo = new Som([[988, 0.25]], 0.10);
var somVitoria = new Som([[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.30], [659, 0.12], [784, 0.45]], 0.12);
var somDerrota = new Som([[392, 0.18], [330, 0.18], [262, 0.18], [196, 0.45]], 0.12);

// os sons do duelo saem do lado de quem fez o barulho
function panDe(x) {
    return (x / 450 - 1) * 0.6;
}

// ----- regras e tempo -----
var statusJogo = "start";   // start, jogando, pausado, fim
var play = false;
var modoAlvo = false;       // false = duelo de dois jogadores; true = tiro ao alvo
var oponente = jogador2;    // em quem o jogador 1 atira: o jogador 2 ou o alvo
var metaPontos = 10;        // pontos para vencer
var demolicao = false;      // balas arrancam pedaços do obstáculo ("Blowaway")
var fuga = false;           // pode andar logo depois de atirar ("Getaway")
var seisBalas = false;      // seis tiros para cada um até a recarga ("Six Shooter")
var vencedor = null;
var tempo = 99;             // segundos do tiro ao alvo
var ticks = 0;

var contagem = 0;           // "PREPARAR..." antes do duelo
var pausaPonto = 0;         // pausa depois que alguém é atingido
var espera = 0;             // evita reiniciar sem querer na tela final
var tremor = 0;             // tremida de tela
var aviso = "";             // recado rápido no meio do campo
var tempoAviso = 0;

// ----- teclado -----
var teclas = {};            // teclas que estão apertadas agora

// teclas que normalmente rolam a página (ou apertam o botão que está com o
// foco) e por isso ficam com o jogo enquanto ele está na tela
var TECLAS_DO_JOGO = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "NumpadEnter", "Numpad0"];

// O jogo só usa o teclado quando pelo menos metade do palco aparece na
// tela; quem está lendo a página rola com as setas e o espaço como sempre.
// (Se o palco for mais alto que a janela, basta ele cobrir metade dela.)
function jogoVisivel() {
    var r = palco.getBoundingClientRect();
    var parteVisivel = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return r.height > 0 && parteVisivel >= Math.min(r.height, window.innerHeight) / 2;
}

// a janela perdeu o foco, a aba sumiu ou o palco saiu da tela: ninguém
// continua "segurando" tecla nenhuma
function soltaTeclas() {
    teclas = {};
}

document.addEventListener("keydown", function (event) {
    // Ctrl, Alt e Cmd são atalhos do navegador; sem WebGL não há jogo na
    // tela; e com o palco longe a tecla é da página
    if (event.ctrlKey || event.altKey || event.metaKey || !pincel.ok || !jogoVisivel()) {
        return;
    }
    var teclaDoJogo = (TECLAS_DO_JOGO.indexOf(event.code) !== -1);
    if (event.repeat) {
        // Tecla segurada: só segura a rolagem se o jogo pegou a tecla quando
        // ela foi apertada. Quem vem descendo a página com a seta apertada
        // não fica preso quando o palco aparece.
        if (teclaDoJogo && teclas[event.code]) {
            event.preventDefault();
        }
        return;
    }
    if (teclaDoJogo) {
        event.preventDefault();
    }
    teclas[event.code] = true;

    if (event.code === "KeyM") {
        Som.mudo = !Som.mudo;
    }
    // a câmera troca em qualquer momento, até no menu
    if (event.code === "KeyC") {
        trocaCamera();
    }

    var confirma = (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space");

    if (statusJogo === "start") {
        if (event.code === "KeyW" || event.code === "ArrowUp") { menu.sobe(); somMenu.play(); }
        if (event.code === "KeyS" || event.code === "ArrowDown") { menu.desce(); somMenu.play(); }
        if (event.code === "KeyA" || event.code === "ArrowLeft") { menu.muda(-1); somMenu.play(); }
        if (event.code === "KeyD" || event.code === "ArrowRight") { menu.muda(1); somMenu.play(); }
        ajustaMenu();
        trocaCenario();
        if (confirma) { comecaJogo(); }
    } else if (statusJogo === "jogando") {
        if (event.code === "KeyP" || event.code === "Escape") { pausa(); }
    } else if (statusJogo === "pausado") {
        if (event.code === "KeyP") { continua(); }
        if (event.code === "Escape") { voltaAoMenu(); }
    } else if (statusJogo === "fim" && espera <= 0) {
        if (confirma) { comecaJogo(); }
        if (event.code === "Escape") { voltaAoMenu(); }
    }
});

document.addEventListener("keyup", function (event) {
    // a subida de uma tecla que o jogo pegou também fica com ele: em alguns
    // navegadores o botão da página que está com o foco é apertado quando
    // o espaço sobe
    if (teclas[event.code] && TECLAS_DO_JOGO.indexOf(event.code) !== -1) {
        event.preventDefault();
    }
    teclas[event.code] = false;
});

// se a janela perde o foco, solta as teclas e pausa
window.addEventListener("blur", function () {
    soltaTeclas();
    pausa();
});

// Se a página rolou (ou a janela mudou de tamanho) no meio da partida e
// menos da metade do palco ficou na tela, os jogadores perdem o teclado:
// o duelo pausa. Fora da partida não há o que pausar, e a conta nem é
// feita enquanto alguém rola o texto da página.
function confereVisibilidade() {
    if (statusJogo === "jogando" && !jogoVisivel()) {
        soltaTeclas();
        pausa();
    }
}

window.addEventListener("scroll", confereVisibilidade);
window.addEventListener("resize", confereVisibilidade);

// aba escondida: solta as teclas e pausa (o laço para sozinho); na volta
// o HUD é redesenhado inteiro e o laço volta a rodar
document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
        soltaTeclas();
        pausa();
    } else {
        hudChave = "";
        ligaLaco();
    }
});

// Se a placa de vídeo for reiniciada no meio da partida, ninguém enxerga o
// duelo: pausa. O motor refaz o 3D sozinho; quando ele (ou o canvas do HUD)
// volta, o HUD é redesenhado e o laço religado.
canvas3d.addEventListener("webglcontextlost", function () {
    soltaTeclas();
    pausa();
});
canvas3d.addEventListener("webglcontextrestored", voltaDoCanvas);
hud.addEventListener("contextrestored", voltaDoCanvas);

function voltaDoCanvas() {
    hudChave = "";
    ligaLaco();
}

function pausa() {
    if (statusJogo === "jogando") {
        statusJogo = "pausado";
        play = false;
    }
}

function continua() {
    statusJogo = "jogando";
    play = true;
    // quem estava mirando quando o jogo pausou guarda a arma, para não
    // disparar sozinho na volta
    if (jogador1.estado === "mirando") { jogador1.estado = "parado"; }
    if (jogador2.estado === "mirando") { jogador2.estado = "parado"; }
}

function voltaAoMenu() {
    statusJogo = "start";
    play = false;
    tempoAviso = 0;
    apagaEfeitos();
    jogador1.reinicia();
    jogador2.reinicia();
    obstaculo.restaura();       // no menu o cenário aparece inteiro
}

// ----- câmera (também usadas pelos botões da página, em site.js) -----
// troca para a próxima câmera e devolve o nome dela
// (no menu a câmera passeia sozinha, então o recado avisa qual foi escolhida)
function trocaCamera() {
    var nome = camera.troca();
    if (statusJogo === "jogando" || statusJogo === "start") {
        mostraAviso("CÂMERA: " + nome);
    }
    return nome;
}

// chave = "classica", "alta" ou "cinema"
function escolheCamera(chave) {
    return camera.escolhe(chave);
}

function nomeDaCamera() {
    return camera.nome;
}

function chaveDaCamera() {
    return camera.chave;
}

// ----- menu -----
// Duas combinações não fazem sentido e o menu corrige sozinho:
//  - o cacto tem raiz, então nunca é uma barreira móvel;
//  - o muro fecha a rua do fundo até a frente: sem demolição ninguém
//    acertaria ninguém (no cartucho original também era assim).
function ajustaMenu() {
    if (menu.valor(OP_CENARIO) === 0) {
        menu.opcoes[OP_BARREIRA].atual = 0;
    }
    if (menu.valor(OP_CENARIO) === 2) {
        menu.opcoes[OP_DEMOLICAO].atual = 1;
    }
}

// Põe em cena o obstáculo escolhido no menu. A cidade muda de cor junto
// com ele, e os pistoleiros passam a respeitar a largura dele.
function trocaCenario() {
    var escolhido = obstaculos[menu.valor(OP_CENARIO)];
    if (escolhido !== obstaculo) {
        escolhido.restaura();
    }
    obstaculo = escolhido;
    cenario.defineTema(obstaculo.paleta);
    jogador1.defineLimites(obstaculo);
    jogador2.defineLimites(obstaculo);
}

trocaCenario();

// número do jogo do cartucho original que tem as mesmas regras (0 = nenhum)
function jogoOriginal() {
    if (menu.valor(OP_VITORIA) !== 1) {
        return 0;
    }
    var chave = "" + menu.valor(OP_MODO) + menu.valor(OP_CENARIO) + menu.valor(OP_BARREIRA) +
        menu.valor(OP_DEMOLICAO) + menu.valor(OP_FUGA) + menu.valor(OP_MUNICAO);
    return JOGOS_ORIGINAIS[chave] || 0;
}

function notaDoMenu() {
    if (menu.selecionada === OP_BARREIRA && menu.valor(OP_CENARIO) === 0) {
        return "O CACTO NUNCA SAI DO LUGAR";
    }
    if (menu.selecionada === OP_DEMOLICAO && menu.valor(OP_CENARIO) === 2) {
        return "O MURO SEMPRE PODE SER DEMOLIDO";
    }
    var numero = jogoOriginal();
    if (numero > 0) {
        return "IGUAL AO JOGO " + numero + " DO CARTUCHO DE 1978";
    }
    return "COMBINAÇÃO NOVA: NÃO EXISTIA NO CARTUCHO";
}

// ----- início da partida -----
function comecaJogo() {
    // lê as escolhas feitas no menu
    modoAlvo = (menu.valor(OP_MODO) === 1);
    trocaCenario();
    obstaculo.movel = (menu.valor(OP_BARREIRA) === 1);
    demolicao = (menu.valor(OP_DEMOLICAO) === 1);
    fuga = (menu.valor(OP_FUGA) === 1);
    seisBalas = (menu.valor(OP_MUNICAO) === 1);
    metaPontos = [5, 10, 15][menu.valor(OP_VITORIA)];

    oponente = modoAlvo ? alvo : jogador2;

    jogador1.pontos = 0;
    jogador2.pontos = 0;
    jogador1.reinicia();
    jogador2.reinicia();
    alvo.reinicia();
    obstaculo.restaura();
    apagaEfeitos();
    vencedor = null;
    tempo = 99;
    ticks = 0;

    contagem = 90;
    pausaPonto = 0;
    tremor = 0;
    tempoAviso = 0;

    statusJogo = "jogando";
    play = true;
    camera.comecaIntro();
    somInicio.play();
}

function mostraAviso(texto) {
    aviso = texto;
    tempoAviso = 50;
}

function tiroApertado(p) {
    for (var i = 0; i < p.teclas.tiro.length; i++) {
        if (teclas[p.teclas.tiro[i]]) {
            return true;
        }
    }
    return false;
}

// ----- controle de cada pistoleiro -----
// Como no Atari: segurar o botão saca a arma (o pistoleiro para e mira
// na diagonal com fundo/frente) e a bala só sai quando o botão é solto.
function controla(p) {
    var apertando = tiroApertado(p);
    var horizontal = (teclas[p.teclas.direita] ? 1 : 0) - (teclas[p.teclas.esquerda] ? 1 : 0);
    var vertical = (teclas[p.teclas.baixo] ? 1 : 0) - (teclas[p.teclas.cima] ? 1 : 0);

    if (p.estado === "mirando") {
        aponta(p, vertical);
        if (!apertando) {
            p.atira();
            p.somTiro.play(panDe(p.x + p.width / 2));
            fumacaDoTiro(p);
            // sem a "fuga", fica parado até a bala acertar algo ou sumir
            p.estado = fuga ? "parado" : "atirou";
        }
    } else if (p.estado === "atirou") {
        if (!p.bala.ativa) {
            p.estado = "parado";
        }
    }

    if (p.estado !== "mirando" && p.estado !== "atirou") {
        if (apertando && p.podeAtirar(seisBalas)) {
            p.estado = "mirando";
            p.mira = vertical;
            p.semDirecao = 0;
        } else {
            // apertou o gatilho com o tambor vazio: só faz "clic"
            if (apertando && !p.gatilho && seisBalas && p.municao <= 0) {
                somVazio.play(panDe(p.x + p.width / 2));
            }
            p.dirX = horizontal;
            p.dirZ = vertical;
            p.move();
            // poeirinha nos pés e o barulho das botas a cada passo
            if (p.estado === "andando" && p.timer === 0) {
                soltaParticulas(p.x + p.width / 2 - p.lado * 12, 3, p.z + p.depth / 2 + 6, cenario.corPoeira,
                    2, 1.4, 5, 0.04, MATERIAL.LISO);
                p.somPasso.play(panDe(p.x + p.width / 2));
            }
        }
    }
    p.gatilho = apertando;
}

// O braço acompanha as teclas de fundo/frente. Ele só volta para o meio
// depois de um instante sem nenhuma das duas, para a mira não se perder
// quando o jogador solta a direção e o tiro quase ao mesmo tempo.
function aponta(p, vertical) {
    if (vertical !== 0) {
        p.mira = vertical;
        p.semDirecao = 0;
    } else {
        p.semDirecao += 1;
        if (p.semDirecao > 6) {
            p.mira = 0;
        }
    }
}

// ----- balas e colisões -----
function moveBala(atirador, alvoDaBala) {
    var bala = atirador.bala;
    for (var i = 0; i < PASSOS_BALA && bala.ativa; i++) {
        bala.move();
        if (bala.ricocheteou) {
            var bx = bala.x + bala.width / 2;
            var bz = (bala.velZ > 0) ? bala.z : bala.z + bala.depth;
            somRicochete.play(panDe(bx));
            estilhacos(bx, bala.y + bala.height / 2, bz, CORES.texto, 3, 3);
            soltaParticulas(bx, bala.y + bala.height / 2, bz, CORES.destaque, 4, 3.5, 3, 0.12, MATERIAL.BRILHO);
            clarao(bx, bala.y + bala.height / 2, bz, 34, CORES.destaque, 7);
        }
        collides(atirador, alvoDaBala);
    }
}

function collides(atirador, alvoDaBala) {
    var bala = atirador.bala;
    if (obstaculo.acerta(bala, demolicao)) {
        bala.ativa = false;
        var bx = (bala.velX > 0) ? bala.x + bala.width : bala.x;
        somBloco.play(panDe(bx));
        estilhacos(bx, bala.y + bala.height / 2, bala.z + bala.depth / 2, obstaculo.color, demolicao ? 14 : 4, 5);
        if (demolicao) {
            estilhacos(bx, bala.y + bala.height / 2, bala.z + bala.depth / 2, obstaculo.corSombra, 6, 4);
        }
        clarao(bx, bala.y + bala.height / 2, bala.z + bala.depth / 2, 30, CORES.destaque, 6);
    } else if (alvoDaBala.foiAtingido(bala)) {
        bala.ativa = false;
        marcaPonto(atirador, alvoDaBala);
    }
}

function marcaPonto(atirador, atingido) {
    atirador.pontos += 1;
    atingido.levaTiro();
    var cx = atingido.x + atingido.width / 2;
    var cy = atingido.y + atingido.height * 0.6;
    var cz = atingido.z + atingido.depth / 2;
    estilhacos(cx, cy, cz, atingido.color, 16, 7);
    soltaParticulas(cx, cy, cz, CORES.texto, 6, 5, 3, 0.12, MATERIAL.BRILHO);
    clarao(cx, cy, cz, 60, atingido.color, 10);
    tremor = 14;
    somAcerto.play(panDe(cx));
    // como no cartucho, depois de um acerto ninguém age por cerca de um segundo
    pausaPonto = 62;
}

function estilhacos(x, y, z, cor, quantidade, forca) {
    soltaParticulas(x, y, z, cor, quantidade, forca, 5, 0.15, MATERIAL.LISO);
}

// pega as próximas partículas da roda e põe em jogo, com o tamanho, a
// gravidade e o material de cada tipo de efeito
function soltaParticulas(x, y, z, cor, quantidade, forca, tamanho, gravidade, material) {
    for (var i = 0; i < quantidade; i++) {
        var p = particulas[proximaParticula];
        proximaParticula = (proximaParticula + 1) % TOTAL_PARTICULAS;
        p.reativa(x, y, z, cor, forca);
        p.tamanho = tamanho;
        p.gravidade = gravidade;
        p.material = material;
    }
}

// fumaça cinza e o clarão do tiro saindo da ponta da arma
function fumacaDoTiro(p) {
    var bala = p.bala;
    var x = bala.x + bala.width / 2;
    var y = bala.y + bala.height / 2;
    var z = bala.z + bala.depth / 2;
    clarao(x, y, z, 46, "#ffd27a", 6);
    soltaParticulas(x, y, z, "#9a98a8", 4, 1.3, 7, -0.025, MATERIAL.LISO);
}

function clarao(x, y, z, tamanho, cor, vida) {
    var c = claroes[proximoClarao];
    proximoClarao = (proximoClarao + 1) % TOTAL_CLAROES;
    c.x = x;
    c.y = y;
    c.z = z;
    c.tamanho = tamanho;
    c.cor = cor;
    c.vida = vida;
    c.vidaTotal = vida;
}

// some com todas as partículas e clarões (início da partida e volta ao menu)
function apagaEfeitos() {
    for (var i = 0; i < TOTAL_PARTICULAS; i++) {
        particulas[i].ativa = false;
    }
    for (var i = 0; i < TOTAL_CLAROES; i++) {
        claroes[i].vida = 0;
    }
}

// no modo de seis balas, a recarga só vem quando os dois ficam sem munição
// e não há mais nenhuma bala voando
function recarrega() {
    if (!seisBalas || jogador1.municao > 0 || jogador1.bala.ativa) {
        return;
    }
    if (!modoAlvo && (jogador2.municao > 0 || jogador2.bala.ativa)) {
        return;
    }
    jogador1.municao = 6;
    jogador2.municao = 6;
    somRecarga.play();
    mostraAviso("RECARREGAR!");
}

// depois da pausa de um ponto, quem estava sentado se levanta
function retomaDuelo() {
    if (jogador1.estado === "atingido") { jogador1.estado = "parado"; }
    if (jogador2.estado === "atingido") { jogador2.estado = "parado"; }
}

// temporizador do tiro ao alvo
function atualizaTemporizador() {
    ticks++;
    if (ticks >= 60) {
        tempo -= 1;
        ticks = 0;
    }
}

function gameover() {
    var acabou;
    if (modoAlvo) {
        acabou = (jogador1.pontos >= metaPontos || tempo <= 0);
    } else {
        acabou = (jogador1.pontos >= metaPontos || jogador2.pontos >= metaPontos);
    }

    if (acabou && play === true) {
        play = false;
        statusJogo = "fim";
        espera = 70;
        jogador1.bala.ativa = false;
        jogador2.bala.ativa = false;

        if (modoAlvo) {
            vencedor = (jogador1.pontos >= metaPontos) ? jogador1 : null;
        } else if (jogador1.pontos > jogador2.pontos) {
            vencedor = jogador1;
        } else if (jogador2.pontos > jogador1.pontos) {
            vencedor = jogador2;
        } else {
            vencedor = null;    // os dois chegaram juntos à meta: empate
        }

        if (vencedor) {
            vencedor.estado = "vitoria";
            somVitoria.play();
        } else {
            somDerrota.play();
        }
    }
    return acabou;
}

// ----- atualiza física e lógica -----
function update() {
    // onde cada coisa estava no começo do passo (para o desenho interpolar)
    jogador1.guardaPosicao();
    jogador2.guardaPosicao();
    alvo.guardaPosicao();
    jogador1.bala.guardaPosicao();
    jogador2.bala.guardaPosicao();
    obstaculo.guardaPosicao();

    for (var i = 0; i < TOTAL_PARTICULAS; i++) {
        var particula = particulas[i];
        if (particula.ativa) {
            particula.guardaPosicao();
            particula.move();
        }
    }
    for (var i = 0; i < TOTAL_CLAROES; i++) {
        if (claroes[i].vida > 0) {
            claroes[i].vida -= 1;
        }
    }
    if (tremor > 0) { tremor -= 1; }
    if (tempoAviso > 0) { tempoAviso -= 1; }
    if (espera > 0) { espera -= 1; }

    if (statusJogo === "start") {
        // no menu os dois marcham sem sair do lugar, cada um no seu canto da rua
        jogador1.x = jogador1.xInicial;
        jogador1.z = jogador1.zInicial;
        jogador2.x = jogador2.xInicial;
        jogador2.z = jogador2.zInicial;
        jogador1.estado = "andando";
        jogador2.estado = "andando";
        jogador1.animation(2, 16);
        jogador2.animation(2, 16);
    }

    if (statusJogo === "fim" && vencedor) {
        vencedor.animation(2, 19);      // pulinhos de alegria
        if (espera % 12 === 0) {
            soltaParticulas(vencedor.x + vencedor.width / 2, vencedor.y + vencedor.height + 30,
                vencedor.z + vencedor.depth / 2, CORES.destaque, 2, 6, 4, 0.09, MATERIAL.LISO);
        }
    }

    if (play) {
        if (contagem > 0) {
            contagem -= 1;
            if (contagem === 0) {
                somFogo.play();
                mostraAviso("FOGO!");
            }
        } else {
            jogada();
        }
    }

    camera.atualiza(statusJogo, contagem, vencedor);
}

// um passo da partida depois do "FOGO!"
function jogada() {
    obstaculo.move();

    var estavaEmPausa = (pausaPonto > 0);
    if (estavaEmPausa) {
        // alguém foi atingido: ninguém anda nem atira por um instante,
        // mas uma bala que já estava no ar continua voando
        pausaPonto -= 1;
        jogador1.tempoAtingido += 1;
        jogador2.tempoAtingido += 1;
        jogador1.gatilho = tiroApertado(jogador1);
        jogador2.gatilho = tiroApertado(jogador2);
    } else {
        controla(jogador1);
        if (!modoAlvo) {
            controla(jogador2);
        }
    }
    if (modoAlvo) {
        alvo.move();    // o alvo não para nunca, nem durante a pausa
    }

    moveBala(jogador1, oponente);
    if (!modoAlvo) {
        moveBala(jogador2, jogador1);
    }

    if (modoAlvo) {
        atualizaTemporizador();
        gameover();
    } else if (estavaEmPausa && pausaPonto === 0) {
        if (!gameover()) {
            retomaDuelo();
        }
    }
    recarrega();
}

// ----- desenho do mundo 3D -----
function draw(alfa) {
    pincel.comecaQuadro();
    camera.aplica(tremor, alfa);

    cenario.desenha();
    obstaculo.desenha(alfa);

    jogador1.desenha(alfa);
    if (statusJogo === "start") {
        jogador2.desenha(alfa);
    } else {
        oponente.desenha(alfa);
    }
    jogador1.bala.desenha(alfa);
    jogador2.bala.desenha(alfa);

    for (var i = 0; i < TOTAL_PARTICULAS; i++) {
        if (particulas[i].ativa) {
            particulas[i].desenha(alfa);
        }
    }
    for (var i = 0; i < TOTAL_CLAROES; i++) {
        var c = claroes[i];
        if (c.vida > 0) {
            var forca = Math.max((c.vida - alfa) / c.vidaTotal, 0);
            pincel.brilho(c.x, c.y, c.z, c.tamanho * (0.5 + 0.5 * forca), c.cor, forca);
        }
    }

    pincel.terminaQuadro();
    desenhaHud();
}

// ----- desenho do HUD (placar e letras, no canvas de cima) -----
// O HUD só muda quando um ponto, um recado ou o menu muda. Por isso ele
// guarda uma "chave" com tudo o que está mostrando e só redesenha quando
// a chave fica diferente.
var hudChave = "";

function chaveDoHud() {
    if (!pincel.ok) {
        return "sem webgl";
    }
    var chave = statusJogo;
    if (statusJogo === "start") {
        chave += menu.selecionada;
        for (var i = 0; i < menu.opcoes.length; i++) {
            chave += menu.opcoes[i].atual;
        }
        if (tempoAviso > 0) {
            chave += aviso;
        }
        return chave;
    }
    chave += jogador1.pontos + "," + (modoAlvo ? tempo : jogador2.pontos) + "," + metaPontos + obstaculo.nome;
    if (Som.mudo) {
        chave += "m";
    }
    if (seisBalas) {
        chave += "b" + jogador1.municao + jogador2.municao;
    }
    if (statusJogo === "jogando") {
        if (contagem > 0) {
            chave += "p";
        } else if (tempoAviso > 0) {
            chave += aviso;
        }
    } else if (statusJogo === "fim") {
        chave += (vencedor ? vencedor.nome : "-") + (espera <= 0 ? "e" : "");
    }
    return chave;
}

function desenhaHud() {
    var chave = chaveDoHud();
    if (chave === hudChave) {
        return;
    }
    hudChave = chave;
    pincel2d.clearRect(0, 0, LARGURA, ALTURA);

    if (!pincel.ok) {
        desenhaSemWebgl();
        return;
    }

    // faixa do placar, um pouco transparente para o 3D aparecer por trás
    pincel2d.globalAlpha = 0.75;
    pincel2d.fillStyle = CORES.faixa;
    pincel2d.fillRect(0, 0, LARGURA, ALTURA_PLACAR);
    pincel2d.globalAlpha = 1;

    if (statusJogo === "start") {
        desenhaStart();
        return;
    }
    desenhaPlacar();
    if (statusJogo === "jogando") {
        if (contagem > 0) {
            placar.draw("PREPARAR...", 450, 120, 5, CORES.destaque, "centro", true);
        } else if (tempoAviso > 0) {
            placar.draw(aviso, 450, 120, 5, CORES.destaque, "centro", true);
        }
    } else if (statusJogo === "pausado") {
        escurece(0.6);
        placar.draw("PAUSADO", 450, 250, 8, CORES.destaque, "centro", true);
        placar.draw("P CONTINUA   ESC VOLTA AO MENU", 450, 350, 2, CORES.texto, "centro", true);
    } else if (statusJogo === "fim") {
        desenhaFim();
    }
}

function desenhaPlacar() {
    placar.draw(jogador1.pontos, 225, 8, 8, jogador1.color, "centro");
    if (modoAlvo) {
        placar.draw(tempo, 675, 8, 8, CORES.texto, "centro");
    } else {
        placar.draw(jogador2.pontos, 675, 8, 8, jogador2.color, "centro");
    }

    placar.draw("META " + metaPontos, 450, 8, 3, CORES.texto, "centro");
    placar.draw(obstaculo.nome, 450, 36, 2, CORES.textoFraco, "centro");
    if (Som.mudo) {
        placar.draw("SEM SOM", 450, 54, 2, CORES.destaque, "centro");
    }

    if (seisBalas) {
        desenhaMunicao(jogador1, 40);
        if (!modoAlvo) {
            desenhaMunicao(jogador2, 790);
        }
    }
}

function desenhaMunicao(p, x) {
    for (var i = 0; i < 6; i++) {
        pincel2d.fillStyle = (i < p.municao) ? p.color : "rgba(255, 255, 255, 0.15)";
        pincel2d.fillRect(x + i * 12, 24, 7, 24);
    }
}

// painel escuro e transparente para as letras não brigarem com o 3D
function painel(x, y, largura, altura, alfa) {
    pincel2d.fillStyle = "rgba(10, 8, 40, " + alfa + ")";
    pincel2d.fillRect(x, y, largura, altura);
}

function escurece(alfa) {
    painel(0, ALTURA_PLACAR, LARGURA, ALTURA - ALTURA_PLACAR, alfa);
}

function desenhaStart() {
    placar.draw("DO ATARI AO NAVEGADOR", 450, 29, 2, CORES.textoFraco, "centro");

    placar.draw("OUTLAW", 450, 104, 10, CORES.destaque, "centro", true);
    placar.draw("DUELO NO VELHO OESTE", 450, 188, 3, CORES.texto, "centro", true);

    painel(130, 222, 640, 276, 0.58);
    menu.desenha(170, 620, 236, 34);
    if (tempoAviso > 0) {
        placar.draw(aviso, 450, 476, 2, CORES.destaque, "centro", true);
    } else {
        placar.draw(notaDoMenu(), 450, 476, 2, CORES.textoFraco, "centro", true);
    }

    painel(0, 498, LARGURA, ALTURA - 498, 0.5);
    placar.draw("W/S ESCOLHE   A/D MUDA   ENTER COMEÇA", 450, 508, 3, CORES.destaque, "centro", true);
    placar.draw("JOGADOR 1", 60, 546, 2, jogador1.color, "esquerda", true);
    placar.draw("W A S D ANDA - F ATIRA", 60, 568, 2, CORES.texto, "esquerda", true);
    placar.draw("JOGADOR 2", 840, 546, 2, jogador2.color, "direita", true);
    placar.draw("SETAS ANDAM - ENTER ATIRA", 840, 568, 2, CORES.texto, "direita", true);
    placar.draw("SEGURE O TIRO PARA MIRAR, SOLTE PARA ATIRAR  P PAUSA  M SOM  C CÂMERA", 450, 604, 2, CORES.textoFraco, "centro", true);
}

function desenhaFim() {
    var titulo;
    var cor = CORES.destaque;
    var detalhe = "";

    if (modoAlvo && vencedor) {
        titulo = "NA MOSCA!";
        detalhe = metaPontos + " ACERTOS EM " + (99 - tempo) + " SEGUNDOS";
    } else if (modoAlvo) {
        titulo = "TEMPO ESGOTADO!";
        detalhe = jogador1.pontos + " DE " + metaPontos + " ACERTOS";
    } else if (vencedor) {
        titulo = vencedor.nome + " VENCEU!";
        cor = vencedor.color;
    } else {
        titulo = "EMPATE!";
    }

    painel(0, 96, LARGURA, 146, 0.5);
    placar.draw(titulo, 450, 120, 6, cor, "centro", true);
    placar.draw(detalhe, 450, 176, 3, CORES.texto, "centro", true);
    if (espera <= 0) {
        placar.draw("ENTER JOGA DE NOVO   ESC VOLTA AO MENU", 450, 214, 2, CORES.texto, "centro", true);
    }
}

// sem WebGL não há como desenhar o mundo: o HUD explica o que aconteceu
function desenhaSemWebgl() {
    pincel2d.fillStyle = CORES.faixa;
    pincel2d.fillRect(0, 0, LARGURA, ALTURA);
    placar.draw("OUTLAW", 450, 150, 10, CORES.destaque, "centro", true);
    placar.draw("SEU NAVEGADOR NÃO TEM WEBGL", 450, 300, 4, CORES.texto, "centro", true);
    placar.draw("O DUELO EM 3D PRECISA DELE PARA DESENHAR A CIDADE.", 450, 370, 2, CORES.textoFraco, "centro");
    placar.draw("TENTE ATUALIZAR O NAVEGADOR, ATIVAR A ACELERAÇÃO", 450, 400, 2, CORES.textoFraco, "centro");
    placar.draw("DE HARDWARE OU ABRIR A PÁGINA EM OUTRO NAVEGADOR.", 450, 424, 2, CORES.textoFraco, "centro");
}

// ----- laço principal -----
// update() roda sempre 60 vezes por segundo, mesmo que o monitor tenha
// outra taxa de atualização (120 ou 144 Hz, por exemplo); draw() acompanha
// o monitor e desenha no meio do caminho entre dois passos (alfa), para o
// movimento ficar liso.
var PASSO = 1000 / 60;
var ultimoTempo = 0;        // 0 = o próximo quadro é o primeiro depois de uma parada
var acumulado = 0;
var rodando = false;        // o laço está pedindo quadros ao navegador?

// O jogo fica no fim da página. Com o palco fora da tela ou a aba
// escondida, o laço para de vez: nada é calculado nem desenhado. Quem avisa
// que o palco apareceu é o IntersectionObserver, com uma folga de 100
// pixels para o primeiro quadro já estar pronto quando ele surgir.
var FOLGA_DA_TELA = 100;

function palcoNaTela() {
    var r = palco.getBoundingClientRect();
    return r.height > 0 && r.bottom > -FOLGA_DA_TELA && r.top < window.innerHeight + FOLGA_DA_TELA;
}

var palcoVisivel = true;    // sem IntersectionObserver o jogo roda sempre, como antes
if (window.IntersectionObserver) {
    // a primeira resposta do observador só chega depois do primeiro quadro
    palcoVisivel = palcoNaTela();
    new IntersectionObserver(function (entradas) {
        var visivel = entradas[entradas.length - 1].isIntersecting;
        if (visivel && !palcoVisivel) {
            hudChave = "";      // o que mudou longe da tela aparece no HUD
        }
        palcoVisivel = visivel;
        if (visivel) {
            ligaLaco();
        } else {
            soltaTeclas();
            pausa();
        }
    }, { rootMargin: FOLGA_DA_TELA + "px 0px" }).observe(palco);
}

// volta a pedir quadros, se o laço estava parado
function ligaLaco() {
    ultimoTempo = 0;        // o tempo em que ele ficou parado não conta
    if (!rodando) {
        rodando = true;
        requestAnimationFrame(main);
    }
}

function main(agora) {
    // palco longe ou aba escondida: para até ligaLaco() ser chamado de novo
    if (!palcoVisivel || document.hidden) {
        rodando = false;
        return;
    }
    // sem WebGL não há mundo para calcular: o HUD só explica o que houve
    if (!pincel.ok) {
        desenhaHud();
        rodando = false;
        return;
    }

    if (ultimoTempo === 0) {
        ultimoTempo = agora;
    }
    // Um quadro muito atrasado (o computador engasgou) vale no máximo 200 ms.
    // Sem esse limite o jogo tentaria tirar todo o atraso de uma vez, aquele
    // quadro demoraria ainda mais, o próximo também, e ele travaria.
    acumulado += Math.min(Math.max(agora - ultimoTempo, 0), 200);
    ultimoTempo = agora;

    while (acumulado >= PASSO) {
        update();
        acumulado -= PASSO;
    }

    draw(acumulado / PASSO);
    requestAnimationFrame(main);
}

ligaLaco();
