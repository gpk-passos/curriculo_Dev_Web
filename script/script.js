(() => {
    'use strict';

    const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
    const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Duração das animações controladas por JS (0 quando o usuário pede menos movimento)
    const duracao = (ms) => (reduzMovimento.matches ? 0 : ms);

    /* =========================================
       1. MENU LATERAL
       ========================================= */
    const menu = $('#menu-lateral');
    const btnAbrirMenu = $('#btn-abrir-menu');
    const btnFecharMenu = $('#btn-fechar-menu');
    const overlayMenu = $('#overlay-menu');
    const linksMenu = $$('.link-menu', menu);

    function menuAberto() {
        return document.body.classList.contains('menu-aberto');
    }

    function abrirNav() {
        document.body.classList.add('menu-aberto');
        menu.removeAttribute('inert');
        btnAbrirMenu.setAttribute('aria-expanded', 'true');
        btnFecharMenu.focus({ preventScroll: true });
    }

    function fecharNav(devolverFoco = true) {
        document.body.classList.remove('menu-aberto');
        menu.setAttribute('inert', '');
        btnAbrirMenu.setAttribute('aria-expanded', 'false');
        if (devolverFoco) btnAbrirMenu.focus({ preventScroll: true });
    }

    btnAbrirMenu.addEventListener('click', abrirNav);
    btnFecharMenu.addEventListener('click', () => fecharNav());
    overlayMenu.addEventListener('click', () => fecharNav());
    // Ao escolher uma seção, o foco segue o scroll; não devolvemos ao botão do menu
    linksMenu.forEach((link) => link.addEventListener('click', () => fecharNav(false)));

    /* Destaca no menu a seção que está na tela */
    const secoes = $$('main section[id]');
    const observadorSecoes = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            linksMenu.forEach((link) => {
                const ativo = link.getAttribute('href') === `#${entrada.target.id}`;
                link.classList.toggle('ativo', ativo);
                if (ativo) link.setAttribute('aria-current', 'true');
                else link.removeAttribute('aria-current');
            });
        });
    }, { rootMargin: '-35% 0px -60% 0px' });
    secoes.forEach((secao) => observadorSecoes.observe(secao));

    /* =========================================
       2. BARRA DE PROGRESSO E VOLTAR AO TOPO
       ========================================= */
    const barraProgresso = $('#progresso-leitura');
    const btnTopo = $('#btn-topo');
    let rolagemAgendada = false;

    function atualizarRolagem() {
        rolagemAgendada = false;
        const rolavel = document.documentElement.scrollHeight - window.innerHeight;
        const progresso = rolavel > 0 ? window.scrollY / rolavel : 0;
        barraProgresso.style.transform = `scaleX(${Math.min(1, Math.max(0, progresso))})`;
        btnTopo.hidden = window.scrollY < 600;
    }

    window.addEventListener('scroll', () => {
        if (rolagemAgendada) return;
        rolagemAgendada = true;
        requestAnimationFrame(atualizarRolagem);
    }, { passive: true });

    btnTopo.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: reduzMovimento.matches ? 'auto' : 'smooth' });
    });
    atualizarRolagem();

    /* =========================================
       3. AVISO (TOAST), COPIAR CONTATO E PDF
       ========================================= */
    const toast = $('#toast');
    let timerToast;

    function mostrarToast(mensagem) {
        toast.textContent = mensagem;
        toast.classList.add('visivel');
        clearTimeout(timerToast);
        timerToast = setTimeout(() => toast.classList.remove('visivel'), 2500);
    }

    async function copiarTexto(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch {
            // Alternativa para contextos sem a API de área de transferência
            const campo = document.createElement('textarea');
            campo.value = texto;
            campo.setAttribute('readonly', '');
            campo.style.position = 'fixed';
            campo.style.opacity = '0';
            document.body.appendChild(campo);
            campo.select();
            let copiou = false;
            try { copiou = document.execCommand('copy'); } catch { /* sem suporte */ }
            campo.remove();
            return copiou;
        }
    }

    $$('.btn-copiar').forEach((botao) => {
        botao.addEventListener('click', async () => {
            const { copiar, rotulo } = botao.dataset;
            const ok = await copiarTexto(copiar);
            mostrarToast(ok ? `${rotulo} copiado` : `Não foi possível copiar. Selecione o texto manualmente.`);
        });
    });

    $('#btn-pdf').addEventListener('click', () => window.print());

    // Na impressão, abre as experiências recolhidas e restaura depois
    let detalhesFechados = [];
    window.addEventListener('beforeprint', () => {
        detalhesFechados = $$('details:not([open])');
        detalhesFechados.forEach((d) => d.setAttribute('open', ''));
    });
    window.addEventListener('afterprint', () => {
        detalhesFechados.forEach((d) => d.removeAttribute('open'));
        detalhesFechados = [];
    });

    /* =========================================
       4. CARROSSEL DE PORTFÓLIO (loop infinito)
       ========================================= */
    const wrapper = $('.carrossel-wrapper');
    const viewport = $('.carrossel-viewport');
    const track = $('#track-projetos');
    const cards = $$('.carrossel-item', track); // ordem original, usada pelo modal
    let animando = false;

    function larguraPasso() {
        const gap = parseFloat(getComputedStyle(track).gap) || 0;
        return track.firstElementChild.offsetWidth + gap;
    }

    function cardVisivel(card) {
        const r = card.getBoundingClientRect();
        const v = viewport.getBoundingClientRect();
        return r.width > 0 && r.left >= v.left - 2 && r.right <= v.right + 2;
    }

    // Só os cards visíveis entram na ordem do Tab; os escondidos pelo overflow ficam de fora
    function atualizarFoco() {
        cards.forEach((card) => card.setAttribute('tabindex', cardVisivel(card) ? '0' : '-1'));
    }

    function moverCarrossel(direcao) {
        if (animando || cards.length === 0) return;
        animando = true;

        const passo = larguraPasso();
        const ms = duracao(500);

        if (direcao === 1) {
            track.style.transition = `transform ${ms}ms ease-in-out`;
            track.style.transform = `translateX(-${passo}px)`;
            setTimeout(() => {
                track.style.transition = 'none';
                track.appendChild(track.firstElementChild);
                track.style.transform = 'translateX(0)';
                animando = false;
                atualizarFoco();
            }, ms);
        } else {
            track.style.transition = 'none';
            track.prepend(track.lastElementChild);
            track.style.transform = `translateX(-${passo}px)`;
            track.offsetWidth; // força o navegador a registrar a posição inicial
            track.style.transition = `transform ${ms}ms ease-in-out`;
            track.style.transform = 'translateX(0)';
            setTimeout(() => {
                animando = false;
                atualizarFoco();
            }, ms);
        }
    }

    $('.btn-carrossel.prev').addEventListener('click', () => moverCarrossel(-1));
    $('.btn-carrossel.next').addEventListener('click', () => moverCarrossel(1));

    wrapper.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); moverCarrossel(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); moverCarrossel(1); }
    });

    /* Arrastar com o dedo ou o mouse */
    let inicioX = null;
    let arrastou = false;

    viewport.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        inicioX = e.clientX;
        arrastou = false;
    });
    viewport.addEventListener('pointerup', (e) => {
        if (inicioX === null) return;
        const deslocamento = e.clientX - inicioX;
        inicioX = null;
        if (Math.abs(deslocamento) > 50) {
            arrastou = true;
            moverCarrossel(deslocamento < 0 ? 1 : -1);
        }
    });
    viewport.addEventListener('pointercancel', () => { inicioX = null; });
    // Um arrasto não deve contar como clique no card
    viewport.addEventListener('click', (e) => {
        if (arrastou) {
            e.preventDefault();
            e.stopPropagation();
            arrastou = false;
        }
    }, true);

    window.addEventListener('resize', atualizarFoco);
    atualizarFoco();

    /* =========================================
       5. MODAL DE PROJETOS (transição FLIP)
       ========================================= */
    const modal = $('#modal-projeto');
    const conteudoModal = $('.modal-content');
    const btnFecharModal = $('#btn-fechar-modal');
    const btnAnterior = $('#modal-anterior');
    const btnProximo = $('#modal-proximo');
    const btnJogar = $('#modal-jogar');
    const detalhesModal = $('#modal-detalhes');
    const painelJogo = $('#modal-jogo');
    const areaJogo = $('#area-jogo');
    const caixaJogo = $('#caixa-jogo');
    const frameJogo = $('#frame-jogo');
    const btnSairJogo = $('#btn-sair-jogo');
    let indiceAtual = 0;
    let modalAberto = false;
    let jogando = false;
    let timerFechar;

    function preencherModal(indice) {
        const card = cards[indice];
        const { img, titulo, contexto, ano, descricao, controles, jogo } = card.dataset;
        const imagem = $('#modal-img');
        imagem.src = img;
        imagem.alt = $('img', card).alt;
        $('#modal-titulo').textContent = titulo;
        $('#modal-contexto').textContent = contexto;
        $('#modal-ano').textContent = ano || '';
        $('#modal-ano').hidden = !ano;
        $('#modal-descricao').textContent = descricao;
        $('#modal-controles').textContent = controles ? `Controles: ${controles}` : '';
        $('#modal-controles').hidden = !controles;
        btnJogar.hidden = !jogo;
        $('#modal-contador').textContent = `${indice + 1} de ${cards.length}`;
    }

    // Posição do card de origem relativa ao centro da tela (o modal é centralizado).
    // Se o card estiver escondido pelo carrossel, a animação vira só um zoom suave.
    function transformarParaCard(card) {
        if (!cardVisivel(card)) return 'translate(0px, 0px) scale(0.92)';
        const r = card.getBoundingClientRect();
        const centroX = document.documentElement.clientWidth / 2;
        const centroY = window.innerHeight / 2;
        const dx = r.left + r.width / 2 - centroX;
        const dy = r.top + r.height / 2 - centroY;
        const escala = r.width / conteudoModal.offsetWidth;
        return `translate(${dx}px, ${dy}px) scale(${escala})`;
    }

    function abrirModal(card) {
        clearTimeout(timerFechar);
        indiceAtual = cards.indexOf(card);
        preencherModal(indiceAtual);
        modalAberto = true;

        modal.classList.add('mostrar');
        modal.style.transition = 'none';
        modal.style.opacity = '0';
        conteudoModal.style.transition = 'none';
        conteudoModal.style.opacity = '0';
        conteudoModal.style.transformOrigin = 'center center';
        conteudoModal.style.transform = transformarParaCard(card);
        conteudoModal.offsetHeight; // reflow: registra o estado inicial

        const ms = duracao(400);
        modal.style.transition = `opacity ${ms}ms ease-in-out`;
        modal.style.opacity = '1';
        conteudoModal.style.transition = `transform ${ms}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${ms}ms ease-in-out`;
        conteudoModal.style.transform = 'translate(0px, 0px) scale(1)';
        conteudoModal.style.opacity = '1';

        document.body.style.overflow = 'hidden';
        btnFecharModal.focus({ preventScroll: true });
    }

    function fecharModal() {
        if (!modalAberto) return;
        sairDoJogo({ devolverFoco: false });
        modalAberto = false;

        const card = cards[indiceAtual];
        const ms = duracao(400);
        conteudoModal.style.transition = `transform ${ms}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${ms}ms ease-in-out`;
        conteudoModal.style.transform = transformarParaCard(card);
        conteudoModal.style.opacity = '0';
        modal.style.transition = `opacity ${ms}ms ease-in-out`;
        modal.style.opacity = '0';

        timerFechar = setTimeout(() => {
            modal.classList.remove('mostrar');
            conteudoModal.style.transform = '';
            conteudoModal.style.transition = '';
            conteudoModal.style.opacity = '';
            modal.style.transition = '';
            modal.style.opacity = '';
            document.body.style.overflow = '';
            // Devolve o foco ao card (ou à seta, se o card estiver fora da tela)
            const destino = cardVisivel(card) ? card : $('.btn-carrossel.next');
            destino.focus({ preventScroll: true });
        }, ms);
    }

    /* Jogar dentro do próprio modal (iframe), sem abrir nova guia */
    function ajustarJogo() {
        if (!jogando) return;
        const { jogoLargura, jogoAltura } = cards[indiceAtual].dataset;
        const dispW = areaJogo.clientWidth;
        const dispH = areaJogo.clientHeight;
        if (!jogoLargura) {
            // Página fluida (ex.: site do Outlaw): ocupa toda a área
            caixaJogo.style.width = '100%';
            caixaJogo.style.height = '100%';
            frameJogo.style.width = '100%';
            frameJogo.style.height = '100%';
            frameJogo.style.transform = 'none';
            return;
        }
        // Jogo com tamanho fixo: reduz proporcionalmente para caber na tela
        const largura = Number(jogoLargura);
        const altura = Number(jogoAltura);
        const escala = Math.min(1, dispW / largura, dispH / altura);
        caixaJogo.style.width = `${largura * escala}px`;
        caixaJogo.style.height = `${altura * escala}px`;
        frameJogo.style.width = `${largura}px`;
        frameJogo.style.height = `${altura}px`;
        frameJogo.style.transform = `scale(${escala})`;
    }

    function jogar() {
        const card = cards[indiceAtual];
        if (!card.dataset.jogo) return;
        jogando = true;
        conteudoModal.classList.add('modo-jogo');
        detalhesModal.hidden = true;
        painelJogo.hidden = false;
        $('#jogo-titulo').textContent = card.dataset.titulo;
        $('#jogo-controles').textContent = card.dataset.controles || '';
        frameJogo.title = `Jogo: ${card.dataset.titulo}`;
        ajustarJogo();
        // Dá o foco ao jogo assim que carregar, para o teclado funcionar de imediato
        frameJogo.addEventListener('load', () => {
            if (jogando) frameJogo.contentWindow.focus();
        }, { once: true });
        frameJogo.src = card.dataset.jogo;
        btnSairJogo.focus({ preventScroll: true });
    }

    function sairDoJogo({ devolverFoco = true } = {}) {
        if (!jogando) return;
        jogando = false;
        frameJogo.src = 'about:blank'; // encerra o jogo e o som
        painelJogo.hidden = true;
        detalhesModal.hidden = false;
        conteudoModal.classList.remove('modo-jogo');
        if (devolverFoco) btnJogar.focus({ preventScroll: true });
    }

    function navegarModal(passo) {
        if (jogando) return;
        indiceAtual = (indiceAtual + passo + cards.length) % cards.length;
        preencherModal(indiceAtual);
    }

    track.addEventListener('click', (e) => {
        const card = e.target.closest('.carrossel-item');
        if (card) abrirModal(card);
    });
    btnFecharModal.addEventListener('click', fecharModal);
    btnJogar.addEventListener('click', jogar);
    btnSairJogo.addEventListener('click', () => sairDoJogo());
    window.addEventListener('resize', ajustarJogo);
    btnAnterior.addEventListener('click', () => navegarModal(-1));
    btnProximo.addEventListener('click', () => navegarModal(1));
    modal.addEventListener('click', (e) => {
        if (e.target === modal && !jogando) fecharModal();
    });

    /* =========================================
       6. TECLADO GLOBAL
       ========================================= */
    document.addEventListener('keydown', (e) => {
        if (modalAberto) {
            if (e.key === 'Escape') { jogando ? sairDoJogo() : fecharModal(); return; }
            if (e.key === 'ArrowLeft') { navegarModal(-1); return; }
            if (e.key === 'ArrowRight') { navegarModal(1); return; }
            if (e.key === 'Tab') {
                // Mantém o foco dentro do modal enquanto ele está aberto
                const focaveis = jogando
                    ? [btnFecharModal, btnSairJogo]
                    : [btnFecharModal, ...(btnJogar.hidden ? [] : [btnJogar]), btnAnterior, btnProximo];
                const primeiro = focaveis[0];
                const ultimo = focaveis[focaveis.length - 1];
                if (e.shiftKey && document.activeElement === primeiro) {
                    e.preventDefault();
                    ultimo.focus();
                } else if (!e.shiftKey && document.activeElement === ultimo) {
                    e.preventDefault();
                    primeiro.focus();
                }
            }
            return;
        }
        if (e.key === 'Escape' && menuAberto()) fecharNav();
    });
})();
