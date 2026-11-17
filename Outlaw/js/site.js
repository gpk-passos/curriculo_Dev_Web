/* =====================================================================
   OUTLAW - recursos da página que ficam fora do jogo:
   retratos dos pistoleiros, tela cheia e os botões de som, câmera e
   gráficos, com as escolhas guardadas no navegador.

   A página não pode quebrar se o jogo não carregou (navegador sem WebGL,
   erro em outro arquivo...). Por isso tudo o que vem do jogo é conferido
   com typeof antes de ser usado, e as chamadas ao jogo ficam em try/catch.
   ===================================================================== */

// ----- escolhas guardadas -----
// O localStorage pode não existir ou estar bloqueado (aba anônima, página
// aberta direto do disco em alguns navegadores). Sem ele a escolha só vale
// até a página ser fechada, mas o resto continua funcionando.
function leEscolha(nome) {
    try {
        return window.localStorage.getItem("outlaw." + nome);
    } catch (erro) {
        return null;
    }
}

function guardaEscolha(nome, valor) {
    try {
        window.localStorage.setItem("outlaw." + nome, valor);
    } catch (erro) {
        // sem localStorage não há onde guardar: fica só para esta visita
    }
}

// o jogo conseguiu ligar o WebGL?
function webglLigado() {
    return typeof pincel !== "undefined" && pincel !== null && pincel.ok === true;
}

/* ---------------------------- retratos --------------------------- */

// Cada <canvas class="retrato"> diz nos atributos data- qual pistoleiro
// quer (data-lado) e em que pose (data-estado).
var POSE_DO_RETRATO = { mirando: "miraReta", parado: "parado" };

// No jogo os bonecos 3D olham um para o outro, de lado para a câmera. Na
// foto cada um gira na direção de quem vê (radianos) até o rosto aparecer
// de três quartos, ainda virado para o rival: o laranja, no cartão da
// esquerda, olha para a direita; o vermelho, no da direita, para a esquerda.
var GIRO_DO_RETRATO = { "1": -1, "-1": 1 };

function desenhaRetratos() {
    var telas = document.querySelectorAll("canvas.retrato");
    for (var i = 0; i < telas.length; i++) {
        var tela = telas[i];
        var lado = (Number(tela.dataset.lado) === -1) ? -1 : 1;
        var quadro = POSE_DO_RETRATO[tela.dataset.estado] || "parado";
        // com WebGL, uma "foto" do boneco de voxels; sem ele, os pixels de sempre
        if (!fotografaRetrato(tela, lado, quadro)) {
            pintaRetrato(tela, lado, quadro);
        }
    }
}

// Pede ao pincel 3D uma foto do pistoleiro, com o mesmo boneco de voxels
// do jogo. Devolve false quando não dá, e aí o retrato é pintado em 2D.
function fotografaRetrato(tela, lado, quadro) {
    if (!webglLigado() || typeof pincel.fotografa !== "function") {
        return false;
    }
    var jogador = null;
    if (lado === 1 && typeof jogador1 !== "undefined") {
        jogador = jogador1;
    } else if (lado === -1 && typeof jogador2 !== "undefined") {
        jogador = jogador2;
    }
    if (!jogador || typeof jogador.malhaDoQuadro !== "function") {
        return false;
    }

    var foto = null;
    try {
        var malha = jogador.malhaDoQuadro(quadro);
        if (malha) {
            // o dobro do tamanho que o retrato tem na tela (84 x 126 no CSS),
            // para ficar nítido também em telas de alta densidade
            foto = pincel.fotografa(malha, 168, 252, GIRO_DO_RETRATO[lado]);
        }
    } catch (erro) {
        foto = null;
    }
    if (!foto || fotoVazia(foto)) {
        return false;
    }

    tela.width = foto.width;
    tela.height = foto.height;
    tela.getContext("2d").putImageData(foto, 0, 0);
    tela.classList.add("foto3d");      // no CSS: reduzir suavizando, não pixelado
    return true;
}

// uma foto toda transparente quer dizer que o desenho falhou em silêncio
function fotoVazia(foto) {
    var dados = foto.data;
    for (var i = 3; i < dados.length; i += 4) {
        if (dados[i] !== 0) {
            return false;
        }
    }
    return true;
}

// Sem WebGL: pinta a matriz de pixels do pistoleiro (sprites.js) no
// tamanho original, como a página sempre fez.
function pintaRetrato(tela, lado, quadro) {
    if (typeof pintaMatriz !== "function" || typeof SPRITES_PISTOLEIRO === "undefined" || typeof CORES === "undefined") {
        return;
    }
    var matriz = SPRITES_PISTOLEIRO[quadro];
    if (!matriz) {
        return;
    }
    var paleta;
    if (lado === 1) {
        paleta = { C: CORES.jogador1, E: CORES.jogador1Escuro, P: CORES.pele, A: CORES.arma };
    } else {
        paleta = { C: CORES.jogador2, E: CORES.jogador2Escuro, P: CORES.pele, A: CORES.arma };
    }
    tela.width = matriz[0].length * PIXEL_L;
    tela.height = matriz.length * PIXEL_A;
    try {
        // o jogador 2 é o mesmo desenho espelhado
        pintaMatriz(tela.getContext("2d"), matriz, 0, 0, PIXEL_L, PIXEL_A, paleta, lado === -1);
    } catch (erro) {
        // sem retrato, mas a página segue de pé
    }
}

/* --------------------------- tela cheia -------------------------- */

// Vai para a tela cheia o palco inteiro (o canvas 3D, o placar e as linhas
// de TV), não um canvas só. O Safari antigo só conhece os nomes com "webkit".
var botaoTelaCheia = document.getElementById("botaoTelaCheia");
var palcoDoJogo = document.getElementById("palco");

function telaCheiaDisponivel() {
    if (!palcoDoJogo) {
        return false;
    }
    var permitida = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    var existe = palcoDoJogo.requestFullscreen || palcoDoJogo.webkitRequestFullscreen;
    return Boolean(permitida && existe);
}

function elementoEmTelaCheia() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function alternaTelaCheia() {
    var pedido = null;
    if (elementoEmTelaCheia()) {
        if (document.exitFullscreen) {
            pedido = document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    } else if (palcoDoJogo.requestFullscreen) {
        pedido = palcoDoJogo.requestFullscreen();
    } else if (palcoDoJogo.webkitRequestFullscreen) {
        palcoDoJogo.webkitRequestFullscreen();
    }
    // o navegador pode recusar o pedido: não é um erro do jogo
    if (pedido && typeof pedido.catch === "function") {
        pedido.catch(function () {});
    }
}

function atualizaBotaoTelaCheia() {
    botaoTelaCheia.textContent = elementoEmTelaCheia() ? "Sair da tela cheia" : "Tela cheia";
}

botaoTelaCheia.addEventListener("click", function () {
    if (telaCheiaDisponivel()) {
        alternaTelaCheia();
    }
    botaoTelaCheia.blur();      // senão a barra de espaço "clica" o botão de novo
});

// o texto do botão acompanha a tela cheia, que também pode ser fechada com Esc
document.addEventListener("fullscreenchange", atualizaBotaoTelaCheia);
document.addEventListener("webkitfullscreenchange", atualizaBotaoTelaCheia);

/* ------------------------------- som ----------------------------- */

var botaoSom = document.getElementById("botaoSom");

// A classe Som vem de avulso.js. Se aquele arquivo parou antes de chegar
// nela, até o typeof dá erro (a classe existe, mas não foi criada), e por
// isso o acesso fica dentro do try.
function pegaSom() {
    try {
        return (typeof Som !== "undefined") ? Som : null;
    } catch (erro) {
        return null;
    }
}

function atualizaBotaoSom() {
    var som = pegaSom();
    if (!som) {
        botaoSom.textContent = "Som: indisponível";
        botaoSom.disabled = true;
        return;
    }
    botaoSom.textContent = som.mudo ? "Som: desligado" : "Som: ligado";
}

function guardaSom() {
    var som = pegaSom();
    if (som) {
        guardaEscolha("som", som.mudo ? "desligado" : "ligado");
    }
}

botaoSom.addEventListener("click", function () {
    var som = pegaSom();
    if (som) {
        som.mudo = !som.mudo;
        guardaSom();
    }
    atualizaBotaoSom();
    botaoSom.blur();
});

/* ----------------------------- câmera ---------------------------- */

var botaoCamera = document.getElementById("botaoCamera");
var CHAVES_DA_CAMERA = ["classica", "alta", "cinema"];

function cameraDisponivel() {
    return webglLigado() && typeof trocaCamera === "function" && typeof nomeDaCamera === "function";
}

function nomeDaCameraAtual() {
    try {
        return cameraDisponivel() ? String(nomeDaCamera()) : "";
    } catch (erro) {
        return "";
    }
}

// a chave de cada câmera é o nome sem acento e em minúsculas ("CLÁSSICA" vira "classica")
function chaveDoNomeDaCamera(nome) {
    return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function atualizaBotaoCamera() {
    var nome = nomeDaCameraAtual();
    if (!nome) {
        botaoCamera.textContent = webglLigado() ? "Câmera: indisponível" : "Câmera: sem WebGL";
        botaoCamera.disabled = true;
        return;
    }
    botaoCamera.textContent = "Câmera: " + nome.toLowerCase();
}

function guardaCamera() {
    var nome = nomeDaCameraAtual();
    if (nome && CHAVES_DA_CAMERA.indexOf(chaveDoNomeDaCamera(nome)) !== -1) {
        guardaEscolha("camera", chaveDoNomeDaCamera(nome));
    }
}

botaoCamera.addEventListener("click", function () {
    if (cameraDisponivel()) {
        try {
            trocaCamera();
        } catch (erro) {
            // fica na câmera que estava
        }
        guardaCamera();
    }
    atualizaBotaoCamera();
    botaoCamera.blur();
});

/* ---------------------------- gráficos --------------------------- */

// alta: sombras detalhadas; média: sombras mais simples; baixa: só uma
// mancha escura embaixo de cada um, para computadores mais fracos
var botaoGraficos = document.getElementById("botaoGraficos");
var GRAFICOS_EM_ORDEM = ["alta", "media", "baixa"];
var NOMES_DOS_GRAFICOS = { alta: "alto", media: "médio", baixa: "baixo" };

function atualizaBotaoGraficos() {
    if (!webglLigado()) {
        botaoGraficos.textContent = "Gráficos: sem WebGL";
        botaoGraficos.disabled = true;
        return;
    }
    botaoGraficos.textContent = "Gráficos: " + (NOMES_DOS_GRAFICOS[pincel.qualidade] || "alto");
}

botaoGraficos.addEventListener("click", function () {
    if (webglLigado()) {
        // depois da baixa volta para a alta
        var atual = GRAFICOS_EM_ORDEM.indexOf(pincel.qualidade);
        try {
            pincel.qualidade = GRAFICOS_EM_ORDEM[(atual + 1) % GRAFICOS_EM_ORDEM.length];
            guardaEscolha("graficos", pincel.qualidade);
        } catch (erro) {
            // mantém a qualidade que estava
        }
    }
    atualizaBotaoGraficos();
    botaoGraficos.blur();
});

// ----- teclas M e C -----
// As teclas são tratadas em jogo.js. Este ouvinte fica na window, que
// recebe o evento depois do document: quando ele roda, o jogo já trocou
// o som ou a câmera, e os botões só copiam o estado novo.
window.addEventListener("keydown", function (event) {
    if (event.code === "KeyM") {
        atualizaBotaoSom();
        guardaSom();
    } else if (event.code === "KeyC") {
        atualizaBotaoCamera();
        guardaCamera();
    }
});

// ----- começo -----
// Primeiro devolve as escolhas da última visita, depois acerta os botões
// e tira as fotos dos pistoleiros.
function restauraEscolhas() {
    var som = pegaSom();
    var escolhaSom = leEscolha("som");
    if (som && (escolhaSom === "ligado" || escolhaSom === "desligado")) {
        som.mudo = (escolhaSom === "desligado");
    }

    var graficos = leEscolha("graficos");
    if (webglLigado() && GRAFICOS_EM_ORDEM.indexOf(graficos) !== -1) {
        try {
            pincel.qualidade = graficos;
        } catch (erro) {
            // fica a qualidade padrão do motor
        }
    }

    var chave = leEscolha("camera");
    if (cameraDisponivel() && typeof escolheCamera === "function" && CHAVES_DA_CAMERA.indexOf(chave) !== -1) {
        try {
            escolheCamera(chave);
        } catch (erro) {
            // fica a câmera clássica
        }
    }
}

restauraEscolhas();
atualizaBotaoTelaCheia();
atualizaBotaoSom();
atualizaBotaoCamera();
atualizaBotaoGraficos();
if (!telaCheiaDisponivel()) {
    botaoTelaCheia.disabled = true;
}
desenhaRetratos();
