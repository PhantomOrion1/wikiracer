// Translated info pages (how to play, play with friends, party modes) for /es/ /pt/ /de/ /fr/.
// build-pages.js renders these with the same layout as the English pages. `p` is the language's
// home path ("/es/"), used for links inside the body.
const N = ' ';

module.exports = {
  es: {
    htmlLang: 'es',
    ui: { playNow: 'Jugar ahora', home: 'Inicio', partyModes: 'Modos fiesta', howItWorks: 'Cómo funciona', makeRoom: 'Crear sala', playWithFriends: 'Jugar con amigos', howToPlay: 'Cómo jugar', rules: 'Reglas', tips: 'Consejos', otherModes: 'Otros modos fiesta', play: (n) => `Jugar a ${n}`, howTo: (n) => `Cómo jugar a ${n}` },
    pages: {
      'how-to-play': {
        title: 'Cómo jugar a las carreras de Wikipedia: reglas y trucos | WikiRacer Live',
        description: 'Cómo funciona una carrera de Wikipedia: empieza en un artículo y llega al objetivo usando solo enlaces, con el menor número de clics. Reglas, tiempos y trucos.',
        h1: 'Cómo jugar',
        body: (p) => `
    <p class="lead">Una carrera de Wikipedia (también llamada «juego de Wikipedia» o speedrun de Wikipedia) es sencilla: empiezas en un artículo y tienes que llegar a otro usando solo los enlaces de los artículos. Gana quien use menos clics.</p>
    <div class="cta"><a class="play" href="${p}">Empezar una carrera</a><a class="play ghost" href="${p}multiplayer/">Jugar con amigos</a></div>
    <h2>Las reglas</h2>
    <ol class="steps">
      <li><b>Empiezas en el artículo de inicio.</b> El objetivo se muestra arriba todo el tiempo.</li>
      <li><b>Haz clic en enlaces dentro del artículo.</b> Sin buscador, sin escribir direcciones y sin webs externas. Los enlaces a categorías, archivos y otros wikis están desactivados.</li>
      <li><b>Llega al objetivo.</b> En cuanto se abre su artículo, terminas. Gana quien use menos clics; en caso de empate, el más rápido.</li>
    </ol>
    <h2>Qué cuenta como clic</h2>
    <p>Cada artículo que abres cuenta como un clic, incluido volver atrás con el botón <b>Atrás</b>. Saltar a una sección del mismo artículo es gratis.</p>
    <h2>Límites de tiempo</h2>
    <table>
      <thead><tr><th>Dificultad</th><th>Tiempo</th><th>Cómo es la pareja</th></tr></thead>
      <tbody>
        <tr><td><span class="tag easy">Fácil</span></td><td>2:30</td><td>Temas conocidos a unos dos clics de distancia.</td></tr>
        <tr><td><span class="tag medium">Medio</span></td><td>5:00</td><td>Temas de áreas distintas sin enlace directo.</td></tr>
        <tr><td><span class="tag hard">Difícil</span></td><td>10:00</td><td>No existe ruta de dos clics. Necesitarás un plan.</td></tr>
      </tbody>
    </table>
    <h2>Juego limpio</h2>
    <ul>
      <li><b>Salir de la pestaña</b> oculta el artículo hasta que vuelvas, y el reloj sigue corriendo.</li>
      <li><b>Buscar en la página (Ctrl/⌘+F)</b> no encuentra enlaces, así que hay que leer.</li>
      <li><b>Cada ruta multijugador se comprueba</b> con los enlaces reales de Wikipedia, y los tiempos imposibles se marcan.</li>
    </ul>
    <h2>Trucos de los más rápidos</h2>
    <ul>
      <li><b>De lo general a lo concreto.</b> Países, ciudades, siglos y grandes temas enlazan a casi todo.</li>
      <li><b>Piensa al revés.</b> ¿Qué artículo enlazaría seguro al objetivo? Ve a por ese.</li>
      <li><b>Mira el primer párrafo y la ficha.</b> Los enlaces más útiles suelen estar arriba.</li>
      <li><b>No leas de más.</b> En una carrera, escanear gana a leer.</li>
    </ul>
    <h2>Modos de juego</h2>
    <p><b>Partida rápida</b> te mete en una sala pública. Las <b>salas privadas</b> te dejan competir con hasta 8 amigos con un código (<a href="${p}multiplayer/">cómo funciona</a>) y tienen <a href="${p}party-modes/">modos fiesta</a>. En <b>Solo</b> practicas a cualquier dificultad, y el <b>reto diario</b> da a todos la misma pareja cada día.</p>
    <div class="cta"><a class="play" href="${p}">Jugar ahora</a></div>`,
      },
      multiplayer: {
        title: 'Carrera de Wikipedia con amigos online | WikiRacer Live',
        description: 'Compite en vivo con hasta 8 amigos por Wikipedia. Crea una sala privada, comparte el código, elige el inicio y el objetivo y compara rutas al final. Gratis y sin registro.',
        h1: 'Jugar con amigos',
        body: (p) => `
    <p class="lead">Compite en vivo por Wikipedia con amigos, compañeros de clase o de trabajo. Todos tienen el mismo inicio y objetivo, ven el progreso de los demás y comparan rutas al final. Es gratis, no hay que instalar nada y no necesitas cuenta.</p>
    <div class="cta"><a class="play" href="${p}">Crear sala</a></div>
    <h2>Empieza una carrera privada</h2>
    <ol class="steps">
      <li><b>Escribe tu nombre</b> en la página de inicio y elige <b>Crear</b>.</li>
      <li><b>Comparte el código de 5 letras</b> o el enlace de invitación. Pueden entrar hasta 8 jugadores.</li>
      <li><b>Elige la carrera:</b> Fácil, Medio o Difícil, una pareja propia o un <a href="${p}party-modes/">modo fiesta</a>.</li>
      <li><b>¡A correr!</b> Todos ven una cuenta atrás y el reloj empieza a la vez para todos.</li>
    </ol>
    <h2>Partida rápida</h2>
    <p>¿Quieres competir con desconocidos? <b>Partida rápida</b> te mete en una sala pública. La siguiente carrera empieza sola.</p>
    <h2>Durante y después de la carrera</h2>
    <ul>
      <li><b>Progreso en vivo:</b> ve cuántos clics lleva cada corredor.</li>
      <li><b>Mirar:</b> cuando termines o te rindas, puedes ver la pantalla de los demás en directo.</li>
      <li><b>Comparar rutas:</b> los resultados muestran el camino completo de cada jugador.</li>
      <li><b>Lane Rush:</b> un minijuego de carreras para mientras esperas.</li>
    </ul>
    <h2>Justo y estable</h2>
    <p>Cada ruta se comprueba con los enlaces reales de Wikipedia y los tiempos imposibles se marcan. Si el anfitrión pierde la conexión, otro jugador toma el control y la carrera sigue.</p>
    <div class="cta"><a class="play" href="${p}">Jugar ahora</a><a class="play ghost" href="${p}how-to-play/">Ver las reglas</a></div>`,
      },
      'party-modes': {
        title: 'Juegos de Wikipedia para fiestas: Wiki Bingo, Niebla de guerra y más | WikiRacer Live',
        description: 'Cuatro modos fiesta para carreras de Wikipedia con amigos: Wiki Bingo, Niebla de guerra, Carrera de velocidad y Battle Royale. Gratis, en el navegador, hasta 8 jugadores.',
        h1: 'Modos fiesta',
        lead: 'Las salas privadas tienen cuatro modos fiesta que cambian cómo funciona la carrera. Crea una sala, pulsa <b>🎉 Fiesta</b> y el anfitrión elige uno. Todos en la sala ven la elección.',
      },
    },
    party: {
      'wiki-bingo': {
        name: 'Wiki Bingo', title: 'Wiki Bingo: bingo de Wikipedia con amigos | WikiRacer Live',
        description: 'Juega a Wiki Bingo online: todos reciben el mismo cartón de 3×3 artículos de Wikipedia. Visítalos haciendo clic en enlaces. Gana la primera línea completa. Gratis.',
        lead: 'Wiki Bingo es una carrera de Wikipedia con un giro: en vez de un objetivo, todos tienen el mismo cartón de bingo de 3×3 artículos. Recorre Wikipedia para visitarlos, y gana quien complete antes una línea.',
        how: ['Crea una sala privada y comparte el código.', 'Pulsa <b>🎉 Fiesta</b> y elige <b>Wiki Bingo</b>.', 'Todos empiezan en el mismo artículo con el mismo cartón.', 'Toca una casilla para que sea tu objetivo y ver qué es. Puedes cambiarla cuando quieras.', 'Visitar una página del cartón la marca. Completa una fila, columna o diagonal para ganar.'],
        rules: ['Los clics no importan, solo la velocidad: gana la primera línea completa.', 'Cada ruta se comprueba con Wikipedia, así que hay que visitar las casillas de verdad.', 'Tienes 10 minutos.'],
        tips: ['Busca una línea cuyos temas compartan una página «central», como un país o una década.', 'Los artículos generales (países, siglos, ciencias) enlazan a casi todo.', 'Cambia de objetivo si ves un atajo hacia otra casilla.'],
      },
      'wikipedia-fog-of-war': {
        name: 'Niebla de guerra', title: 'Niebla de guerra en Wikipedia: carrera viendo solo la introducción | WikiRacer Live',
        description: 'Niebla de guerra es una carrera de Wikipedia más difícil: solo ves la introducción de cada artículo, así que tienes que adivinar adónde llevan los enlaces. Gratis, con amigos.',
        lead: 'En Niebla de guerra corres por Wikipedia, pero solo ves la introducción de cada artículo. El resto está oculto, así que tienes que adivinar qué enlaces te acercan al objetivo.',
        how: ['Crea una sala privada e invita a tus amigos.', 'Pulsa <b>🎉 Fiesta</b> y elige <b>Niebla de guerra</b>.', 'Todos corren del mismo inicio al mismo objetivo.', 'Cada artículo muestra solo su introducción: elige bien tus enlaces.'],
        rules: ['Gana quien use menos clics; en caso de empate, el más rápido.', 'Puedes usar el botón Atrás (cuenta como clic).', 'Tienes 10 minutos, y las parejas son algo más fáciles para compensar la niebla.'],
        tips: ['Las introducciones suelen enlazar a los temas más generales: perfectos como trampolín.', 'Si una página es un callejón sin salida, vuelve pronto.', 'Lee la descripción del objetivo en el panel lateral para adivinar su tema.'],
      },
      'wikipedia-speed-race': {
        name: 'Carrera de velocidad', title: 'Carrera de velocidad en Wikipedia: gana el más rápido | WikiRacer Live',
        description: 'Una carrera de Wikipedia donde los clics no importan, solo el tiempo. Compite con amigos de un artículo a otro: gana quien llegue antes al objetivo.',
        lead: 'La Carrera de velocidad es una carrera pura contra el reloj. Los clics no cuentan: gana quien llegue primero al artículo objetivo, sin importar cuántas páginas haya abierto.',
        how: ['Crea una sala privada y comparte el código.', 'Pulsa <b>🎉 Fiesta</b> y elige <b>Carrera de velocidad</b>.', 'Todos empiezan en el mismo artículo con el mismo objetivo.', 'Haz clic lo más rápido que puedas. Gana el primero en llegar.'],
        rules: ['Solo cuenta el tiempo; los clics de más y volver atrás solo cuestan segundos.', 'Cada ruta se comprueba con Wikipedia.', 'Tienes 5 minutos.'],
        tips: ['No leas, escanea: los títulos y el índice son tus aliados.', 'Salta rápido a un artículo general y luego afina.', 'Volver atrás es gratis en este modo: no tengas miedo de probar un enlace.'],
      },
      'wikipedia-battle-royale': {
        name: 'Battle Royale', title: 'Battle Royale de Wikipedia: el último queda eliminado | WikiRacer Live',
        description: 'Battle Royale de Wikipedia para 3 a 8 jugadores: compite ronda tras ronda y el último queda eliminado cada vez, hasta que quede un campeón.',
        lead: 'Battle Royale convierte la carrera de Wikipedia en un torneo de eliminación. Todos corren, el último queda fuera y se sigue ronda tras ronda hasta que solo queda un campeón.',
        how: ['Crea una sala privada con al menos 3 jugadores.', 'Pulsa <b>🎉 Fiesta</b> y elige <b>Battle Royale</b>.', 'Corre como siempre. Al terminar la ronda, el último queda eliminado.', 'Los eliminados pueden mirar al resto en directo.', 'Sigue con más rondas hasta que quede un jugador: ese gana.'],
        rules: ['De 3 a 8 jugadores.', 'Se clasifica por menos clics y luego por tiempo. Rendirse o quedarse sin tiempo te deja último.', 'Cada ronda dura 5 minutos.'],
        tips: ['Ir a lo seguro vale más que arriesgar al principio: solo tienes que no quedar último.', 'En las rondas finales cada clic cuenta: tómate tu tiempo.', 'Mirar a los demás cuando te eliminan es una gran forma de aprender atajos.'],
      },
    },
  },

  pt: {
    htmlLang: 'pt-BR',
    ui: { playNow: 'Jogar agora', home: 'Início', partyModes: 'Modos festa', howItWorks: 'Como funciona', makeRoom: 'Criar sala', playWithFriends: 'Jogar com amigos', howToPlay: 'Como jogar', rules: 'Regras', tips: 'Dicas', otherModes: 'Outros modos festa', play: (n) => `Jogar ${n}`, howTo: (n) => `Como jogar ${n}` },
    pages: {
      'how-to-play': {
        title: 'Como jogar a corrida da Wikipédia: regras e dicas | WikiRacer Live',
        description: 'Como funciona uma corrida na Wikipédia: comece num artigo e chegue ao destino só com links, usando o menor número de cliques. Regras, tempos e dicas.',
        h1: 'Como jogar',
        body: (p) => `
    <p class="lead">Uma corrida na Wikipédia (também chamada de «jogo da Wikipédia» ou speedrun da Wikipédia) é simples: você começa num artigo e precisa chegar a outro usando só os links dos artigos. Vence quem usar menos cliques.</p>
    <div class="cta"><a class="play" href="${p}">Começar uma corrida</a><a class="play ghost" href="${p}multiplayer/">Jogar com amigos</a></div>
    <h2>As regras</h2>
    <ol class="steps">
      <li><b>Você começa no artigo inicial.</b> O destino aparece no topo o tempo todo.</li>
      <li><b>Clique em links dentro do artigo.</b> Sem busca, sem digitar endereços e sem sites externos. Links para categorias, arquivos e outros wikis ficam desativados.</li>
      <li><b>Chegue ao destino.</b> Assim que o artigo abre, você termina. Vence quem usar menos cliques; no empate, o mais rápido.</li>
    </ol>
    <h2>O que conta como clique</h2>
    <p>Cada artigo que você abre conta como um clique, inclusive voltar com o botão <b>Voltar</b>. Pular para uma seção do mesmo artigo é grátis.</p>
    <h2>Limites de tempo</h2>
    <table>
      <thead><tr><th>Dificuldade</th><th>Tempo</th><th>Como é o par</th></tr></thead>
      <tbody>
        <tr><td><span class="tag easy">Fácil</span></td><td>2:30</td><td>Temas conhecidos a uns dois cliques de distância.</td></tr>
        <tr><td><span class="tag medium">Médio</span></td><td>5:00</td><td>Temas de áreas diferentes sem link direto.</td></tr>
        <tr><td><span class="tag hard">Difícil</span></td><td>10:00</td><td>Não existe rota de dois cliques. Você vai precisar de um plano.</td></tr>
      </tbody>
    </table>
    <h2>Jogo limpo</h2>
    <ul>
      <li><b>Sair da aba</b> esconde o artigo até você voltar, e o relógio continua.</li>
      <li><b>Buscar na página (Ctrl/⌘+F)</b> não encontra links, então é preciso ler.</li>
      <li><b>Toda rota multijogador é conferida</b> nos links reais da Wikipédia, e tempos impossíveis são sinalizados.</li>
    </ul>
    <h2>Dicas dos mais rápidos</h2>
    <ul>
      <li><b>Do geral para o específico.</b> Países, cidades, séculos e grandes temas têm link para quase tudo.</li>
      <li><b>Pense de trás para frente.</b> Que artigo com certeza teria link para o destino? Vá atrás dele.</li>
      <li><b>Olhe o primeiro parágrafo e a infobox.</b> Os links mais úteis costumam estar no topo.</li>
      <li><b>Não leia demais.</b> Numa corrida, passar o olho vence ler.</li>
    </ul>
    <h2>Modos de jogo</h2>
    <p><b>Partida rápida</b> coloca você numa sala pública. <b>Salas privadas</b> deixam você correr com até 8 amigos usando um código (<a href="${p}multiplayer/">como funciona</a>) e têm <a href="${p}party-modes/">modos festa</a>. No <b>Solo</b> você treina em qualquer dificuldade, e o <b>desafio diário</b> dá a todos o mesmo par a cada dia.</p>
    <div class="cta"><a class="play" href="${p}">Jogar agora</a></div>`,
      },
      multiplayer: {
        title: 'Corrida na Wikipédia com amigos online | WikiRacer Live',
        description: 'Corra ao vivo com até 8 amigos pela Wikipédia. Crie uma sala privada, compartilhe o código, escolha início e destino e compare as rotas no final. Grátis e sem cadastro.',
        h1: 'Jogar com amigos',
        body: (p) => `
    <p class="lead">Corra ao vivo pela Wikipédia com amigos, colegas de escola ou de trabalho. Todos têm o mesmo início e destino, veem o progresso dos outros e comparam as rotas no final. É grátis, não precisa instalar nada nem criar conta.</p>
    <div class="cta"><a class="play" href="${p}">Criar sala</a></div>
    <h2>Comece uma corrida privada</h2>
    <ol class="steps">
      <li><b>Digite seu nome</b> na página inicial e escolha <b>Criar</b>.</li>
      <li><b>Compartilhe o código de 5 letras</b> ou o link de convite. Até 8 jogadores podem entrar.</li>
      <li><b>Escolha a corrida:</b> Fácil, Médio ou Difícil, um par próprio ou um <a href="${p}party-modes/">modo festa</a>.</li>
      <li><b>Corra!</b> Todos veem uma contagem regressiva e o relógio começa junto para todos.</li>
    </ol>
    <h2>Partida rápida</h2>
    <p>Quer correr contra desconhecidos? <b>Partida rápida</b> coloca você numa sala pública. A próxima corrida começa sozinha.</p>
    <h2>Durante e depois da corrida</h2>
    <ul>
      <li><b>Progresso ao vivo:</b> veja quantos cliques cada jogador já deu.</li>
      <li><b>Assistir:</b> quando terminar ou desistir, você pode ver a tela dos outros ao vivo.</li>
      <li><b>Comparar rotas:</b> os resultados mostram o caminho completo de cada jogador.</li>
      <li><b>Lane Rush:</b> um minijogo de corrida para quando você está esperando.</li>
    </ul>
    <h2>Justo e estável</h2>
    <p>Toda rota é conferida nos links reais da Wikipédia e tempos impossíveis são sinalizados. Se o anfitrião cair, outro jogador assume e a corrida continua.</p>
    <div class="cta"><a class="play" href="${p}">Jogar agora</a><a class="play ghost" href="${p}how-to-play/">Ver as regras</a></div>`,
      },
      'party-modes': {
        title: 'Jogos da Wikipédia para festas: Wiki Bingo, Névoa de guerra e mais | WikiRacer Live',
        description: 'Quatro modos festa para corridas na Wikipédia com amigos: Wiki Bingo, Névoa de guerra, Corrida de velocidade e Battle Royale. Grátis, no navegador, até 8 jogadores.',
        h1: 'Modos festa',
        lead: 'As salas privadas têm quatro modos festa que mudam como a corrida funciona. Crie uma sala, toque em <b>🎉 Festa</b> e o anfitrião escolhe um. Todos na sala veem a escolha.',
      },
    },
    party: {
      'wiki-bingo': {
        name: 'Wiki Bingo', title: 'Wiki Bingo: bingo da Wikipédia com amigos | WikiRacer Live',
        description: 'Jogue Wiki Bingo online: todos recebem a mesma cartela 3×3 de artigos da Wikipédia. Visite-os clicando em links. Vence a primeira linha completa. Grátis.',
        lead: 'Wiki Bingo é uma corrida na Wikipédia com uma reviravolta: em vez de um destino, todos têm a mesma cartela de bingo 3×3 de artigos. Navegue pela Wikipédia para visitá-los, e vence quem completar uma linha primeiro.',
        how: ['Crie uma sala privada e compartilhe o código.', 'Toque em <b>🎉 Festa</b> e escolha <b>Wiki Bingo</b>.', 'Todos começam no mesmo artigo com a mesma cartela.', 'Toque num quadrado para torná-lo seu destino e ver o que é. Troque quando quiser.', 'Visitar uma página da cartela a marca. Complete uma linha, coluna ou diagonal para vencer.'],
        rules: ['Cliques não importam, só a velocidade: vence a primeira linha completa.', 'Toda rota é conferida na Wikipédia, então é preciso visitar os quadrados de verdade.', 'Você tem 10 minutos.'],
        tips: ['Procure uma linha cujos temas compartilhem uma página «central», como um país ou uma década.', 'Artigos gerais (países, séculos, ciências) têm link para quase tudo.', 'Troque de destino se achar um atalho para outro quadrado.'],
      },
      'wikipedia-fog-of-war': {
        name: 'Névoa de guerra', title: 'Névoa de guerra na Wikipédia: corrida vendo só a introdução | WikiRacer Live',
        description: 'Névoa de guerra é uma corrida mais difícil na Wikipédia: você só vê a introdução de cada artigo e precisa adivinhar para onde os links levam. Grátis, com amigos.',
        lead: 'Na Névoa de guerra você corre pela Wikipédia, mas só vê a introdução de cada artigo. O resto fica escondido, então é preciso adivinhar quais links levam mais perto do destino.',
        how: ['Crie uma sala privada e convide os amigos.', 'Toque em <b>🎉 Festa</b> e escolha <b>Névoa de guerra</b>.', 'Todos correm do mesmo início ao mesmo destino.', 'Cada artigo mostra só a introdução: escolha bem seus links.'],
        rules: ['Vence quem usar menos cliques; no empate, o mais rápido.', 'Você ainda pode usar o botão Voltar (conta como clique).', 'Você tem 10 minutos, e os pares são um pouco mais fáceis para compensar a névoa.'],
        tips: ['As introduções costumam ter links para os temas mais gerais: ótimos trampolins.', 'Se uma página não leva a lugar nenhum, volte logo.', 'Leia a descrição do destino no painel lateral para adivinhar o tema.'],
      },
      'wikipedia-speed-race': {
        name: 'Corrida de velocidade', title: 'Corrida de velocidade na Wikipédia: vence o mais rápido | WikiRacer Live',
        description: 'Uma corrida na Wikipédia em que cliques não importam, só o tempo. Corra com amigos de um artigo a outro: vence quem chegar primeiro ao destino.',
        lead: 'A Corrida de velocidade é uma corrida pura contra o relógio. Cliques não contam: vence quem chegar primeiro ao artigo de destino, não importa quantas páginas abriu.',
        how: ['Crie uma sala privada e compartilhe o código.', 'Toque em <b>🎉 Festa</b> e escolha <b>Corrida de velocidade</b>.', 'Todos começam no mesmo artigo com o mesmo destino.', 'Clique o mais rápido que puder. Vence o primeiro a chegar.'],
        rules: ['Só o tempo conta; cliques a mais e voltar só custam segundos.', 'Toda rota é conferida na Wikipédia.', 'Você tem 5 minutos.'],
        tips: ['Não leia, passe o olho: títulos e o índice são seus aliados.', 'Pule rápido para um artigo geral e depois afunile.', 'Voltar é grátis neste modo: não tenha medo de testar um link.'],
      },
      'wikipedia-battle-royale': {
        name: 'Battle Royale', title: 'Battle Royale da Wikipédia: o último é eliminado | WikiRacer Live',
        description: 'Battle Royale da Wikipédia para 3 a 8 jogadores: corra rodada após rodada e o último é eliminado a cada vez, até sobrar um campeão.',
        lead: 'O Battle Royale transforma a corrida na Wikipédia num torneio eliminatório. Todos correm, o último sai, e o jogo segue rodada após rodada até sobrar um campeão.',
        how: ['Crie uma sala privada com pelo menos 3 jogadores.', 'Toque em <b>🎉 Festa</b> e escolha <b>Battle Royale</b>.', 'Corra normalmente. No fim da rodada, o último é eliminado.', 'Os eliminados podem assistir aos outros ao vivo.', 'Continue as rodadas até sobrar um jogador: ele vence.'],
        rules: ['De 3 a 8 jogadores.', 'A classificação é por menos cliques e depois tempo. Desistir ou ficar sem tempo deixa você em último.', 'Cada rodada tem 5 minutos.'],
        tips: ['Jogar seguro vale mais que arriscar no começo: basta não ficar em último.', 'Nas rodadas finais cada clique conta: vá com calma.', 'Assistir aos outros depois de eliminado é ótimo para aprender atalhos.'],
      },
    },
  },

  de: {
    htmlLang: 'de',
    ui: { playNow: 'Jetzt spielen', home: 'Start', partyModes: 'Party-Modi', howItWorks: 'So geht’s', makeRoom: 'Raum erstellen', playWithFriends: 'Mit Freunden spielen', howToPlay: 'So geht’s', rules: 'Regeln', tips: 'Tipps', otherModes: 'Weitere Party-Modi', play: (n) => `${n} spielen`, howTo: (n) => `So spielst du ${n}` },
    pages: {
      'how-to-play': {
        title: 'Wikipedia-Rennen: Regeln und Tipps | WikiRacer Live',
        description: 'So funktioniert ein Wikipedia-Rennen: Starte bei einem Artikel und erreiche das Ziel nur über Links, mit möglichst wenigen Klicks. Regeln, Zeitlimits und Tipps.',
        h1: 'So geht’s',
        body: (p) => `
    <p class="lead">Ein Wikipedia-Rennen (auch „Wikipedia-Spiel“ oder Wikipedia-Speedrun) ist einfach: Du startest bei einem Artikel und musst nur über die Links in den Artikeln zu einem anderen gelangen. Die wenigsten Klicks gewinnen.</p>
    <div class="cta"><a class="play" href="${p}">Rennen starten</a><a class="play ghost" href="${p}multiplayer/">Mit Freunden spielen</a></div>
    <h2>Die Regeln</h2>
    <ol class="steps">
      <li><b>Du startest beim Startartikel.</b> Das Ziel steht die ganze Zeit oben.</li>
      <li><b>Klicke Links im Artikel.</b> Keine Suche, keine eingetippten Adressen, keine externen Seiten. Links zu Kategorien, Dateien und anderen Wikis sind gesperrt.</li>
      <li><b>Erreiche das Ziel.</b> Sobald sein Artikel aufgeht, bist du fertig. Die wenigsten Klicks gewinnen, bei Gleichstand die schnellere Zeit.</li>
    </ol>
    <h2>Was als Klick zählt</h2>
    <p>Jeder geöffnete Artikel zählt als ein Klick, auch das Zurückgehen mit dem <b>Zurück</b>-Knopf. Sprünge zu einem Abschnitt im selben Artikel sind gratis.</p>
    <h2>Zeitlimits</h2>
    <table>
      <thead><tr><th>Schwierigkeit</th><th>Zeit</th><th>So ist das Paar</th></tr></thead>
      <tbody>
        <tr><td><span class="tag easy">Leicht</span></td><td>2:30</td><td>Bekannte Themen, etwa zwei Klicks auseinander.</td></tr>
        <tr><td><span class="tag medium">Mittel</span></td><td>5:00</td><td>Themen aus verschiedenen Bereichen ohne direkten Link.</td></tr>
        <tr><td><span class="tag hard">Schwer</span></td><td>10:00</td><td>Es gibt keine Route mit zwei Klicks. Du brauchst einen Plan.</td></tr>
      </tbody>
    </table>
    <h2>Fair Play</h2>
    <ul>
      <li><b>Den Tab verlassen</b> verdeckt den Artikel, bis du zurückkommst, und die Uhr läuft weiter.</li>
      <li><b>Suchen auf der Seite (Strg/⌘+F)</b> findet keine Links, du musst also lesen.</li>
      <li><b>Jede Mehrspieler-Route wird</b> mit den echten Wikipedia-Links geprüft, unmögliche Zeiten werden markiert.</li>
    </ul>
    <h2>Tipps von schnellen Spielern</h2>
    <ul>
      <li><b>Erst breit, dann eng.</b> Länder, Städte, Jahrhunderte und große Themen verlinken auf fast alles.</li>
      <li><b>Denk rückwärts.</b> Welcher Artikel verlinkt sicher auf das Ziel? Den steuerst du an.</li>
      <li><b>Nutze den ersten Absatz und die Infobox.</b> Die nützlichsten Links stehen meist oben.</li>
      <li><b>Nicht zu viel lesen.</b> Im Rennen schlägt Überfliegen das Lesen.</li>
    </ul>
    <h2>Spielmodi</h2>
    <p><b>Schnelles Spiel</b> bringt dich in einen öffentlichen Raum. In <b>privaten Räumen</b> trittst du mit bis zu 8 Freunden per Code an (<a href="${p}multiplayer/">so geht’s</a>), dort gibt es auch <a href="${p}party-modes/">Party-Modi</a>. Im <b>Solo</b>-Modus übst du auf jeder Stufe, und das <b>Tagesrennen</b> gibt allen jeden Tag dasselbe Paar.</p>
    <div class="cta"><a class="play" href="${p}">Jetzt spielen</a></div>`,
      },
      multiplayer: {
        title: 'Wikipedia-Rennen mit Freunden online spielen | WikiRacer Live',
        description: 'Tritt live gegen bis zu 8 Freunde durch Wikipedia an. Privaten Raum erstellen, Code teilen, Start und Ziel wählen und am Ende die Routen vergleichen. Kostenlos, ohne Anmeldung.',
        h1: 'Mit Freunden spielen',
        body: (p) => `
    <p class="lead">Renne live mit Freunden, Mitschülern oder Kollegen durch Wikipedia. Alle haben denselben Start und dasselbe Ziel, sehen den Fortschritt der anderen und vergleichen am Ende die Routen. Kostenlos, ohne Installation und ohne Konto.</p>
    <div class="cta"><a class="play" href="${p}">Raum erstellen</a></div>
    <h2>Ein privates Rennen starten</h2>
    <ol class="steps">
      <li><b>Gib deinen Namen ein</b> und wähle <b>Neu</b>.</li>
      <li><b>Teile den 5-stelligen Code</b> oder den Einladungslink. Bis zu 8 Spieler können beitreten.</li>
      <li><b>Wähle das Rennen:</b> Leicht, Mittel oder Schwer, ein eigenes Paar oder einen <a href="${p}party-modes/">Party-Modus</a>.</li>
      <li><b>Los geht’s!</b> Alle sehen einen Countdown, dann startet die Uhr für alle gleichzeitig.</li>
    </ol>
    <h2>Schnelles Spiel</h2>
    <p>Lust auf Fremde? <b>Schnelles Spiel</b> bringt dich in einen öffentlichen Raum. Das nächste Rennen startet automatisch.</p>
    <h2>Während und nach dem Rennen</h2>
    <ul>
      <li><b>Live-Fortschritt:</b> sieh, wie viele Klicks jeder hat.</li>
      <li><b>Zuschauen:</b> Wenn du fertig bist oder aufgibst, kannst du anderen live zusehen.</li>
      <li><b>Routen vergleichen:</b> Die Ergebnisse zeigen den ganzen Weg jedes Spielers.</li>
      <li><b>Lane Rush:</b> ein kleines Rennspiel für die Wartezeit.</li>
    </ul>
    <h2>Fair und stabil</h2>
    <p>Jede Route wird mit den echten Wikipedia-Links geprüft, unmögliche Zeiten werden markiert. Fällt der Host aus, übernimmt ein anderer Spieler und das Rennen geht weiter.</p>
    <div class="cta"><a class="play" href="${p}">Jetzt spielen</a><a class="play ghost" href="${p}how-to-play/">Regeln lesen</a></div>`,
      },
      'party-modes': {
        title: 'Wikipedia-Partyspiele: Wiki-Bingo, Nebel des Krieges und mehr | WikiRacer Live',
        description: 'Vier Party-Modi für Wikipedia-Rennen mit Freunden: Wiki-Bingo, Nebel des Krieges, Tempo-Rennen und Battle Royale. Kostenlos, im Browser, bis zu 8 Spieler.',
        h1: 'Party-Modi',
        lead: 'Private Räume haben vier Party-Modi, die das Rennen verändern. Erstelle einen Raum, tippe auf <b>🎉 Party</b> und der Host wählt einen aus. Alle im Raum sehen die Wahl.',
      },
    },
    party: {
      'wiki-bingo': {
        name: 'Wiki-Bingo', title: 'Wiki-Bingo: Wikipedia-Bingo mit Freunden | WikiRacer Live',
        description: 'Spiel Wiki-Bingo online: Alle bekommen dieselbe 3×3-Karte mit Wikipedia-Artikeln. Besuche sie über Links. Die erste volle Reihe gewinnt. Kostenlos.',
        lead: 'Wiki-Bingo ist ein Wikipedia-Rennen mit Twist: Statt eines Ziels haben alle dieselbe 3×3-Bingokarte mit Artikeln. Klick dich durch Wikipedia, um sie zu besuchen. Wer zuerst eine volle Reihe hat, gewinnt.',
        how: ['Erstelle einen privaten Raum und teile den Code.', 'Tippe auf <b>🎉 Party</b> und wähle <b>Wiki-Bingo</b>.', 'Alle starten beim selben Artikel mit derselben Karte.', 'Tippe ein Feld an, um es zu deinem Ziel zu machen und zu sehen, was es ist. Du kannst jederzeit wechseln.', 'Ein besuchter Artikel auf der Karte wird markiert. Eine volle Reihe, Spalte oder Diagonale gewinnt.'],
        rules: ['Klicks zählen nicht, nur das Tempo: Die erste volle Reihe gewinnt.', 'Jede Route wird mit Wikipedia geprüft, du musst die Felder also wirklich besuchen.', 'Du hast 10 Minuten.'],
        tips: ['Such eine Reihe, deren Themen eine gemeinsame „Drehscheibe“ haben, etwa ein Land oder ein Jahrzehnt.', 'Allgemeine Artikel (Länder, Jahrhunderte, Wissenschaften) verlinken auf fast alles.', 'Wechsle das Ziel, wenn du eine Abkürzung zu einem anderen Feld siehst.'],
      },
      'wikipedia-fog-of-war': {
        name: 'Nebel des Krieges', title: 'Wikipedia im Nebel des Krieges: Rennen nur mit Einleitung | WikiRacer Live',
        description: 'Nebel des Krieges ist ein schwierigeres Wikipedia-Rennen: Du siehst nur die Einleitung jedes Artikels und musst raten, wohin die Links führen. Kostenlos, mit Freunden.',
        lead: 'Im Nebel des Krieges rennst du durch Wikipedia, siehst aber nur die Einleitung jedes Artikels. Der Rest ist verborgen, du musst also raten, welche Links dich dem Ziel näherbringen.',
        how: ['Erstelle einen privaten Raum und lade Freunde ein.', 'Tippe auf <b>🎉 Party</b> und wähle <b>Nebel des Krieges</b>.', 'Alle rennen vom selben Start zum selben Ziel.', 'Jeder Artikel zeigt nur die Einleitung: Wähle deine Links mit Bedacht.'],
        rules: ['Die wenigsten Klicks gewinnen, bei Gleichstand die schnellste Zeit.', 'Der Zurück-Knopf geht weiterhin (zählt als Klick).', 'Du hast 10 Minuten, und die Paare sind etwas leichter, um den Nebel auszugleichen.'],
        tips: ['Einleitungen verlinken meist auf die allgemeinsten Themen: perfekte Sprungbretter.', 'Ist eine Seite eine Sackgasse, geh früh zurück.', 'Lies die Beschreibung des Ziels im Seitenfeld, um sein Thema zu erraten.'],
      },
      'wikipedia-speed-race': {
        name: 'Tempo-Rennen', title: 'Wikipedia-Tempo-Rennen: Der Schnellste gewinnt | WikiRacer Live',
        description: 'Ein Wikipedia-Rennen, bei dem Klicks egal sind und nur die Zeit zählt. Renne mit Freunden von einem Artikel zum anderen: Wer zuerst am Ziel ist, gewinnt.',
        lead: 'Das Tempo-Rennen ist ein reines Rennen gegen die Uhr. Klicks zählen nicht: Wer zuerst den Zielartikel erreicht, gewinnt, egal wie viele Seiten es waren.',
        how: ['Erstelle einen privaten Raum und teile den Code.', 'Tippe auf <b>🎉 Party</b> und wähle <b>Tempo-Rennen</b>.', 'Alle starten beim selben Artikel mit demselben Ziel.', 'Klicke so schnell du kannst. Wer zuerst ankommt, gewinnt.'],
        rules: ['Nur die Zeit zählt; Extraklicks und Zurück kosten nur Sekunden.', 'Jede Route wird mit Wikipedia geprüft.', 'Du hast 5 Minuten.'],
        tips: ['Nicht lesen, überfliegen: Überschriften und das Inhaltsverzeichnis helfen.', 'Spring schnell zu einem großen Übersichtsartikel und grenz dann ein.', 'Zurück ist in diesem Modus gratis: Probier ruhig einen Link aus.'],
      },
      'wikipedia-battle-royale': {
        name: 'Battle Royale', title: 'Wikipedia Battle Royale: Der Letzte fliegt raus | WikiRacer Live',
        description: 'Wikipedia Battle Royale für 3 bis 8 Spieler: Renne Runde um Runde, der Letzte fliegt jedes Mal raus, bis ein Champion übrig ist.',
        lead: 'Battle Royale macht aus dem Wikipedia-Rennen ein K.-o.-Turnier. Alle rennen, der Letzte fliegt raus, und es geht Runde um Runde weiter, bis nur noch ein Champion übrig ist.',
        how: ['Erstelle einen privaten Raum mit mindestens 3 Spielern.', 'Tippe auf <b>🎉 Party</b> und wähle <b>Battle Royale</b>.', 'Renne wie gewohnt. Am Rundenende fliegt der Letzte raus.', 'Ausgeschiedene können den anderen live zuschauen.', 'Spielt weitere Runden, bis nur noch einer übrig ist: Der gewinnt.'],
        rules: ['3 bis 8 Spieler.', 'Gewertet wird nach wenigsten Klicks, dann nach Zeit. Aufgeben oder Zeit abgelaufen heißt Letzter.', 'Jede Runde dauert 5 Minuten.'],
        tips: ['Sicher spielen schlägt frühes Risiko: Du musst nur nicht Letzter werden.', 'In den Finalrunden zählt jeder Klick: Lass dir Zeit.', 'Nach dem Ausscheiden zuzuschauen ist ideal, um Abkürzungen zu lernen.'],
      },
    },
  },

  fr: {
    htmlLang: 'fr',
    ui: { playNow: 'Jouer', home: 'Accueil', partyModes: 'Modes fête', howItWorks: 'Comment ça marche', makeRoom: 'Créer un salon', playWithFriends: 'Jouer entre amis', howToPlay: 'Comment jouer', rules: 'Règles', tips: 'Astuces', otherModes: 'Autres modes fête', play: (n) => `Jouer à ${n}`, howTo: (n) => `Comment jouer à ${n}` },
    pages: {
      'how-to-play': {
        title: 'Comment jouer à la course Wikipédia : règles et astuces | WikiRacer Live',
        description: 'Comment marche une course Wikipédia : pars d’un article et atteins la cible uniquement par les liens, en un minimum de clics. Règles, temps et astuces.',
        h1: 'Comment jouer',
        body: (p) => `
    <p class="lead">Une course Wikipédia (aussi appelée « jeu Wikipédia » ou speedrun Wikipédia) est simple : tu pars d’un article et tu dois en atteindre un autre en utilisant seulement les liens des articles. Le moins de clics gagne.</p>
    <div class="cta"><a class="play" href="${p}">Lancer une course</a><a class="play ghost" href="${p}multiplayer/">Jouer entre amis</a></div>
    <h2>Les règles</h2>
    <ol class="steps">
      <li><b>Tu arrives sur l’article de départ.</b> La cible reste affichée en haut tout le temps.</li>
      <li><b>Clique sur les liens de l’article.</b> Pas de recherche, pas d’adresse tapée, pas de sites externes. Les liens vers les catégories, fichiers et autres wikis sont désactivés.</li>
      <li><b>Atteins la cible.</b> Dès que son article s’ouvre, c’est fini. Le moins de clics gagne ; en cas d’égalité, le plus rapide.</li>
    </ol>
    <h2>Ce qui compte comme un clic</h2>
    <p>Chaque article ouvert compte pour un clic, y compris revenir en arrière avec le bouton <b>Retour</b>. Sauter à une section du même article est gratuit.</p>
    <h2>Limites de temps</h2>
    <table>
      <thead><tr><th>Difficulté</th><th>Temps</th><th>À quoi ressemble la paire</th></tr></thead>
      <tbody>
        <tr><td><span class="tag easy">Facile</span></td><td>2:30</td><td>Des sujets connus à environ deux clics l’un de l’autre.</td></tr>
        <tr><td><span class="tag medium">Moyen</span></td><td>5:00</td><td>Des sujets de domaines différents sans lien direct.</td></tr>
        <tr><td><span class="tag hard">Difficile</span></td><td>10:00</td><td>Aucun itinéraire en deux clics. Il te faudra un plan.</td></tr>
      </tbody>
    </table>
    <h2>Fair-play</h2>
    <ul>
      <li><b>Quitter l’onglet</b> masque l’article jusqu’à ton retour, et le chrono continue.</li>
      <li><b>La recherche dans la page (Ctrl/⌘+F)</b> ne trouve pas les liens : il faut lire.</li>
      <li><b>Chaque itinéraire multijoueur est vérifié</b> avec les vrais liens de Wikipédia, et les temps impossibles sont signalés.</li>
    </ul>
    <h2>Astuces des plus rapides</h2>
    <ul>
      <li><b>Du général au précis.</b> Pays, villes, siècles et grands sujets mènent à presque tout.</li>
      <li><b>Pense à l’envers.</b> Quel article ferait forcément un lien vers la cible ? Vise celui-là.</li>
      <li><b>Regarde le premier paragraphe et l’infobox.</b> Les liens les plus utiles sont souvent en haut.</li>
      <li><b>Ne lis pas trop.</b> En course, survoler bat lire.</li>
    </ul>
    <h2>Modes de jeu</h2>
    <p>La <b>partie rapide</b> te place dans un salon public. Les <b>salons privés</b> te permettent d’affronter jusqu’à 8 amis avec un code (<a href="${p}multiplayer/">comment ça marche</a>) et proposent des <a href="${p}party-modes/">modes fête</a>. En <b>Solo</b> tu t’entraînes à tout niveau, et le <b>défi du jour</b> donne à tous la même paire chaque jour.</p>
    <div class="cta"><a class="play" href="${p}">Jouer</a></div>`,
      },
      multiplayer: {
        title: 'Course Wikipédia entre amis en ligne | WikiRacer Live',
        description: 'Affronte jusqu’à 8 amis en direct à travers Wikipédia. Crée un salon privé, partage le code, choisis le départ et la cible, et compare les itinéraires à la fin. Gratuit, sans inscription.',
        h1: 'Jouer entre amis',
        body: (p) => `
    <p class="lead">Fais la course en direct à travers Wikipédia avec des amis, des camarades ou des collègues. Tout le monde a le même départ et la même cible, voit la progression des autres et compare les itinéraires à la fin. Gratuit, rien à installer, pas de compte.</p>
    <div class="cta"><a class="play" href="${p}">Créer un salon</a></div>
    <h2>Lancer une course privée</h2>
    <ol class="steps">
      <li><b>Entre ton pseudo</b> sur l’accueil et choisis <b>Créer</b>.</li>
      <li><b>Partage le code à 5 lettres</b> ou le lien d’invitation. Jusqu’à 8 joueurs peuvent rejoindre.</li>
      <li><b>Choisis la course :</b> Facile, Moyen ou Difficile, ta propre paire ou un <a href="${p}party-modes/">mode fête</a>.</li>
      <li><b>C’est parti !</b> Tout le monde voit un compte à rebours, puis le chrono démarre pour tous en même temps.</li>
    </ol>
    <h2>Partie rapide</h2>
    <p>Envie d’affronter des inconnus ? La <b>partie rapide</b> te place dans un salon public. La course suivante démarre toute seule.</p>
    <h2>Pendant et après la course</h2>
    <ul>
      <li><b>Progression en direct :</b> vois combien de clics chacun a fait.</li>
      <li><b>Regarder :</b> une fois fini ou abandonné, tu peux suivre l’écran des autres en direct.</li>
      <li><b>Comparer les itinéraires :</b> les résultats montrent le chemin complet de chaque joueur.</li>
      <li><b>Lane Rush :</b> un mini-jeu de course pour patienter.</li>
    </ul>
    <h2>Équitable et solide</h2>
    <p>Chaque itinéraire est vérifié avec les vrais liens de Wikipédia et les temps impossibles sont signalés. Si l’hôte perd la connexion, un autre joueur prend le relais et la course continue.</p>
    <div class="cta"><a class="play" href="${p}">Jouer</a><a class="play ghost" href="${p}how-to-play/">Lire les règles</a></div>`,
      },
      'party-modes': {
        title: 'Jeux Wikipédia entre amis : Wiki Bingo, Brouillard de guerre et plus | WikiRacer Live',
        description: 'Quatre modes fête pour les courses Wikipédia entre amis : Wiki Bingo, Brouillard de guerre, Course de vitesse et Battle Royale. Gratuit, dans le navigateur, jusqu’à 8 joueurs.',
        h1: 'Modes fête',
        lead: 'Les salons privés ont quatre modes fête qui changent le déroulement de la course. Crée un salon, appuie sur <b>🎉 Fête</b> et l’hôte en choisit un. Tout le monde dans le salon voit le choix.',
      },
    },
    party: {
      'wiki-bingo': {
        name: 'Wiki Bingo', title: 'Wiki Bingo : le bingo Wikipédia entre amis | WikiRacer Live',
        description: 'Joue au Wiki Bingo en ligne : tout le monde reçoit la même grille 3×3 d’articles Wikipédia. Visite-les en cliquant sur les liens. La première ligne complète gagne. Gratuit.',
        lead: 'Le Wiki Bingo est une course Wikipédia avec un twist : au lieu d’une cible, tout le monde a la même grille de bingo 3×3 d’articles. Parcours Wikipédia pour les visiter : le premier à compléter une ligne gagne.',
        how: ['Crée un salon privé et partage le code.', 'Appuie sur <b>🎉 Fête</b> et choisis <b>Wiki Bingo</b>.', 'Tout le monde part du même article avec la même grille.', 'Touche une case pour en faire ta cible et voir de quoi il s’agit. Change quand tu veux.', 'Visiter une page de la grille la coche. Complète une ligne, une colonne ou une diagonale pour gagner.'],
        rules: ['Les clics ne comptent pas, seule la vitesse : la première ligne complète gagne.', 'Chaque itinéraire est vérifié sur Wikipédia : il faut vraiment visiter les cases.', 'Tu as 10 minutes.'],
        tips: ['Cherche une ligne dont les sujets partagent une page « carrefour », comme un pays ou une décennie.', 'Les articles généraux (pays, siècles, sciences) mènent à presque tout.', 'Change de cible si tu repères un raccourci vers une autre case.'],
      },
      'wikipedia-fog-of-war': {
        name: 'Brouillard de guerre', title: 'Brouillard de guerre sur Wikipédia : course avec l’intro seulement | WikiRacer Live',
        description: 'Le Brouillard de guerre est une course Wikipédia plus difficile : tu ne vois que l’introduction de chaque article et dois deviner où mènent les liens. Gratuit, entre amis.',
        lead: 'En Brouillard de guerre, tu fais la course sur Wikipédia mais tu ne vois que l’introduction de chaque article. Le reste est caché : à toi de deviner quels liens te rapprochent de la cible.',
        how: ['Crée un salon privé et invite tes amis.', 'Appuie sur <b>🎉 Fête</b> et choisis <b>Brouillard de guerre</b>.', 'Tout le monde court du même départ vers la même cible.', 'Chaque article n’affiche que son introduction : choisis bien tes liens.'],
        rules: ['Le moins de clics gagne ; en cas d’égalité, le plus rapide.', 'Le bouton Retour marche toujours (il compte comme un clic).', 'Tu as 10 minutes, et les paires sont un peu plus faciles pour compenser le brouillard.'],
        tips: ['Les introductions mènent souvent aux sujets les plus généraux : parfaits comme tremplins.', 'Si une page est une impasse, reviens vite.', 'Lis la description de la cible dans le panneau latéral pour deviner son thème.'],
      },
      'wikipedia-speed-race': {
        name: 'Course de vitesse', title: 'Course de vitesse Wikipédia : le plus rapide gagne | WikiRacer Live',
        description: 'Une course Wikipédia où les clics ne comptent pas, seul le temps. Affronte tes amis d’un article à l’autre : le premier arrivé à la cible gagne.',
        lead: 'La Course de vitesse est une course pure contre la montre. Les clics ne comptent pas : le premier à atteindre l’article cible gagne, peu importe le nombre de pages.',
        how: ['Crée un salon privé et partage le code.', 'Appuie sur <b>🎉 Fête</b> et choisis <b>Course de vitesse</b>.', 'Tout le monde part du même article avec la même cible.', 'Clique aussi vite que possible. Le premier arrivé gagne.'],
        rules: ['Seul le temps compte ; les clics en trop et les retours ne coûtent que des secondes.', 'Chaque itinéraire est vérifié sur Wikipédia.', 'Tu as 5 minutes.'],
        tips: ['Ne lis pas, survole : les titres et le sommaire sont tes alliés.', 'Saute vite vers un grand article général, puis affine.', 'Revenir en arrière est gratuit dans ce mode : n’hésite pas à tester un lien.'],
      },
      'wikipedia-battle-royale': {
        name: 'Battle Royale', title: 'Battle Royale Wikipédia : le dernier est éliminé | WikiRacer Live',
        description: 'Battle Royale Wikipédia pour 3 à 8 joueurs : enchaîne les manches, le dernier est éliminé à chaque fois, jusqu’à ce qu’il ne reste qu’un champion.',
        lead: 'Le Battle Royale transforme la course Wikipédia en tournoi à élimination. Tout le monde court, le dernier est éliminé, et on enchaîne les manches jusqu’à ce qu’il ne reste qu’un champion.',
        how: ['Crée un salon privé avec au moins 3 joueurs.', 'Appuie sur <b>🎉 Fête</b> et choisis <b>Battle Royale</b>.', 'Fais la course comme d’habitude. À la fin de la manche, le dernier est éliminé.', 'Les éliminés peuvent regarder les autres en direct.', 'Enchaîne les manches jusqu’à ce qu’il ne reste qu’un joueur : il gagne.'],
        rules: ['De 3 à 8 joueurs.', 'Classement au moins de clics, puis au temps. Abandonner ou manquer de temps te met dernier.', 'Chaque manche dure 5 minutes.'],
        tips: ['Jouer la sécurité vaut mieux que prendre des risques au début : il suffit de ne pas finir dernier.', 'Dans les dernières manches, chaque clic compte : prends ton temps.', 'Regarder les autres une fois éliminé est idéal pour apprendre des raccourcis.'],
      },
    },
  },
};
void N;

// Party page extras: hero labels, quick facts, closing call-to-action and the example content
// shown in each mode's picture (titles are real articles in that language).
module.exports.es.extra = {
  kicker: 'Modo fiesta', free: 'Gratis · Sin registro · Hasta 8 jugadores', players: 'Jugadores', time: 'Tiempo', winner: 'Gana',
  ctaTitle: (n) => `¿Listos para una ronda de ${n}?`, ctaText: 'Crea una sala privada, envía el enlace a tus amigos y el modo ya estará elegido.',
  clicksDontCount: 'Los clics no cuentan', out: 'Fuera', round: 'Ronda 3', live: 'En vivo',
  win: { bingo: 'Primera línea completa', fog: 'Menos clics', speed: 'El más rápido', royale: 'El último en pie' },
  visual: { bingo: ['Pizza', 'Luna', 'París', 'Volcán', 'Ajedrez', 'Antiguo Egipto', 'Dinosauria', 'Café', 'Fútbol'], fogTitle: 'Volcán', fogText: 'Un volcán es una abertura en la [[corteza terrestre]] por la que salen [[magma]], ceniza y gases. Muchos se encuentran en el [[Cinturón de Fuego del Pacífico]].', route: ['Pizza', 'Italia', 'Vesubio'] },
};
module.exports.pt.extra = {
  kicker: 'Modo festa', free: 'Grátis · Sem cadastro · Até 8 jogadores', players: 'Jogadores', time: 'Tempo', winner: 'Vence',
  ctaTitle: (n) => `Bora uma rodada de ${n}?`, ctaText: 'Crie uma sala privada, mande o link para os amigos e o modo já vem escolhido.',
  clicksDontCount: 'Cliques não contam', out: 'Fora', round: 'Rodada 3', live: 'Ao vivo',
  win: { bingo: 'Primeira linha completa', fog: 'Menos cliques', speed: 'O mais rápido', royale: 'O último de pé' },
  visual: { bingo: ['Pizza', 'Lua', 'Paris', 'Vulcão', 'Xadrez', 'Antigo Egito', 'Dinossauro', 'Café', 'Futebol'], fogTitle: 'Vulcão', fogText: 'Um vulcão é uma abertura na [[crosta terrestre]] por onde saem [[magma]], cinzas e gases. Muitos ficam no [[Círculo de Fogo do Pacífico]].', route: ['Pizza', 'Itália', 'Vesúvio'] },
};
module.exports.de.extra = {
  kicker: 'Party-Modus', free: 'Kostenlos · Ohne Anmeldung · Bis zu 8 Spieler', players: 'Spieler', time: 'Zeit', winner: 'Sieg',
  ctaTitle: (n) => `Bereit für eine Runde ${n}?`, ctaText: 'Erstelle einen privaten Raum, schick den Link an Freunde, und der Modus ist schon gewählt.',
  clicksDontCount: 'Klicks zählen nicht', out: 'Raus', round: 'Runde 3', live: 'Live',
  win: { bingo: 'Erste volle Reihe', fog: 'Wenigste Klicks', speed: 'Schnellster', royale: 'Wer übrig bleibt' },
  visual: { bingo: ['Pizza', 'Mond', 'Paris', 'Vulkan', 'Schach', 'Altes Ägypten', 'Dinosaurier', 'Kaffee', 'Fußball'], fogTitle: 'Vulkan', fogText: 'Ein Vulkan ist eine Öffnung in der [[Erdkruste]], aus der [[Magma]], Asche und Gase austreten. Viele liegen am [[Pazifischer Feuerring|Pazifischen Feuerring]].', route: ['Pizza', 'Italien', 'Vesuv'] },
};
module.exports.fr.extra = {
  kicker: 'Mode fête', free: 'Gratuit · Sans inscription · Jusqu’à 8 joueurs', players: 'Joueurs', time: 'Temps', winner: 'Victoire',
  ctaTitle: (n) => `Prêts pour une partie de ${n} ?`, ctaText: 'Crée un salon privé, envoie le lien à tes amis, et le mode est déjà choisi.',
  clicksDontCount: 'Les clics ne comptent pas', out: 'Éliminé', round: 'Manche 3', live: 'En direct',
  win: { bingo: 'Première ligne complète', fog: 'Le moins de clics', speed: 'Le plus rapide', royale: 'Le dernier debout' },
  visual: { bingo: ['Pizza', 'Lune', 'Paris', 'Volcan', 'Échecs', 'Égypte antique', 'Dinosaure', 'Café', 'Football'], fogTitle: 'Volcan', fogText: 'Un volcan est une ouverture dans la [[croûte terrestre]] d’où s’échappent [[magma]], cendres et gaz. Beaucoup se trouvent sur la [[ceinture de feu du Pacifique]].', route: ['Pizza', 'Italie', 'Vésuve'] },
};
