(() => {
  'use strict';

  const bookNames = {
    'GEN': 'Génesis',
    'EXO': 'Éxodo',
    'NUM': 'Números',
    'JOS': 'Josué',
    'JDG': 'Jueces',
    'RUT': 'Rut',
    '1SA': '1 Samuel',
    '1KI': '1 Reyes',
    '2KI': '2 Reyes',
    'JOB': 'Job',
    'NEH': 'Nehemías',
    'EST': 'Ester',
    'DAN': 'Daniel',
    'JON': 'Jonás',
    'EZK': 'Ezequiel',
    'MAT': 'Mateo',
    'MRK': 'Marcos',
    'LUK': 'Lucas',
    'JHN': 'Juan',
    'ACT': 'Hechos',
    'REV': 'Apocalipsis',
  };

  // Verse numbers follow the Synodal translation used by the reading links.
  function unpack(testament, rows) {
    return rows.map(([source, question, answer, other, note]) => {
      const [book, chapter, verse] = source.split('.');
      return {
        testament, question, answer, other, note,
        reference: `${bookNames[book]} ${chapter}:${verse}`,
        url: `https://www.bible.com/ru/bible/400/${source}.SYNO`,
      };
    });
  }

  const oldTestament = unpack('Antiguo Testamento', [
    ['GEN.2.8', '¿Dónde vivieron Adán y Eva al principio?', 'En Edén', 'En Egipto', 'Dios plantó un jardín en Edén y puso allí a Adán.'],
    ['GEN.2.22', '¿De qué hizo Dios a Eva?', 'De una costilla de Adán', 'De una piedra', 'Dios tomó una costilla de Adán mientras dormía e hizo a Eva.'],
    ['GEN.4.8', '¿Quién era el hermano de Abel?', 'Caín', 'Noé', 'Abel y Caín eran hijos de Adán y Eva.'],
    ['GEN.6.14', '¿Qué le mandó Dios construir a Noé?', 'Un arca', 'Una torre', 'El arca protegió a la familia de Noé y a los animales durante el diluvio.'],
    ['GEN.8.11', '¿Qué le trajo la paloma a Noé?', 'Una hoja de olivo', 'Una rama de palma', 'La hoja fresca le indicó a Noé que el agua había bajado.'],
    ['GEN.9.13', '¿Qué señal dio Dios tras el diluvio?', 'Un arcoíris', 'Una luna nueva', 'El arcoíris fue la señal del pacto de Dios con la tierra.'],
    ['GEN.11.7', '¿Qué pasó con el habla de los constructores de Babel?', 'Dejaron de entenderse', 'Todos hablaron igual', 'Dios confundió sus lenguas y la obra se detuvo.'],
    ['GEN.12.1', '¿Qué le mandó Dios hacer a Abraham?', 'Ir a otra tierra', 'Construir un palacio', 'Dios llamó a Abraham a salir de su tierra y le mostró un nuevo camino.'],
    ['GEN.21.3', '¿Cómo se llamaba el hijo de Abraham y Sara?', 'Isaac', 'José', 'Isaac nació cuando Abraham y Sara eran ancianos, tal como Dios había prometido.'],
    ['GEN.22.13', '¿Qué animal vio Abraham entre los arbustos?', 'Un carnero', 'Un ciervo', 'El carnero estaba atrapado por los cuernos, y Abraham lo ofreció en lugar de Isaac.'],
    ['GEN.24.19', '¿A qué animales dio agua Rebeca en el pozo?', 'A unos camellos', 'A unas ovejas', 'Rebeca dio de beber a un viajero y luego se ofreció a dar agua a sus camellos.'],
    ['GEN.25.34', '¿De qué era el guiso de Jacob?', 'De lentejas', 'De trigo', 'Esaú recibió pan y guiso de lentejas a cambio de su primogenitura.'],
    ['GEN.28.12', '¿Qué vio Jacob en un sueño?', 'Una escalera hasta el cielo', 'Un barco en el mar', 'En el sueño de Jacob, los ángeles subían y bajaban por la escalera.'],
    ['GEN.32.28', '¿Qué nombre nuevo recibió Jacob?', 'Israel', 'Judá', 'Jacob recibió el nombre de Israel después de luchar durante la noche.'],
    ['GEN.37.3', '¿Qué le regaló su padre a José?', 'Una túnica especial', 'Una copa de oro', 'Jacob quería especialmente a José y le hizo una túnica elegante.'],
    ['GEN.41.25', '¿Quién explicó los sueños del faraón?', 'José', 'Benjamín', 'José explicó que los dos sueños del faraón transmitían un solo mensaje de Dios.'],
    ['GEN.45.3', '¿A quiénes les reveló José su identidad en Egipto?', 'A sus hermanos', 'A los soldados del faraón', 'Sus hermanos no reconocieron a José en Egipto hasta que él les dijo quién era.'],
    ['EXO.2.2', '¿Cuánto tiempo escondió su madre al bebé Moisés?', 'Tres meses', 'Un mes', 'Su madre lo escondió tres meses y después preparó una cesta.'],
    ['EXO.2.3', '¿De qué estaba hecha la cesta de Moisés?', 'De juncos', 'De madera', 'Su madre selló la cesta de juncos con brea y la dejó junto a la orilla.'],
    ['EXO.2.4', '¿Quién vigilaba la cesta de Moisés?', 'Su hermana', 'Su padre', 'Su hermana miró desde lejos para ver qué le pasaría.'],
    ['EXO.2.5', '¿Quién vio la cesta entre los juncos?', 'La hija del faraón', 'Una sirvienta', 'La hija del faraón vio la cesta y mandó a una sirvienta a buscarla.'],
    ['EXO.2.9', '¿Quién amamantó al bebé Moisés?', 'Su madre', 'La hija del faraón', 'Su hermana llevó a su madre, y la hija del faraón le pidió que lo amamantara.'],
    ['EXO.2.10', '¿Por qué llamaron Moisés al bebé?', 'Lo sacaron del agua', 'Era el nombre de su padre', 'La hija del faraón explicó el nombre recordando que lo había sacado del agua.'],
    ['EXO.3.2', '¿Qué ardía ante Moisés sin consumirse?', 'Una zarza', 'Una antorcha', 'Moisés vio llamas en una zarza, pero el fuego no consumía las ramas.'],
    ['EXO.4.14', '¿Quién era el hermano de Moisés?', 'Aarón', 'Abraham', 'Dios envió a Aarón al encuentro de Moisés para ayudarle a hablar.'],
    ['EXO.7.20', '¿En qué se convirtió el agua del Nilo?', 'En sangre', 'En aceite', 'Cuando Aarón golpeó el río con su vara, el agua se convirtió en sangre.'],
    ['EXO.12.7', '¿Qué marcaron con sangre la noche de la Pascua?', 'Las puertas de las casas', 'Los tejados de las casas', 'Con la sangre del cordero marcaron los lados y la parte superior de la puerta.'],
    ['EXO.14.21', '¿Qué se abrió ante Moisés?', 'El mar', 'Las montañas', 'Dios apartó el agua con un viento fuerte, y el pueblo cruzó por tierra seca.'],
    ['EXO.16.15', '¿Cómo se llamaba el alimento de los israelitas en el desierto?', 'Maná', 'Higos', 'Al encontrar un alimento desconocido en el suelo, Moisés explicó que Dios les había dado pan.'],
    ['EXO.17.6', '¿De dónde sacó agua Moisés en el desierto?', 'De una roca', 'De un pozo', 'Moisés golpeó la roca con su vara y de ella salió agua.'],
    ['EXO.31.18', '¿En qué se escribieron los mandamientos en el Sinaí?', 'En tablas de piedra', 'En tablillas de madera', 'Dios le dio a Moisés dos tablas de piedra en el Sinaí.'],
    ['EXO.32.4', '¿Qué ídolo hicieron junto al monte Sinaí?', 'Un becerro de oro', 'Un león de plata', 'Aarón hizo el becerro con las joyas que trajo el pueblo.'],
    ['NUM.21.9', '¿Qué levantó Moisés en un poste?', 'Una serpiente de bronce', 'Una tela blanca', 'Los que habían sufrido mordeduras miraban la serpiente de bronce y seguían con vida.'],
    ['JOS.3.17', '¿Qué río cruzó el pueblo con Josué?', 'El Jordán', 'El Nilo', 'Los sacerdotes con el arca se quedaron en suelo seco en medio del río mientras el pueblo cruzaba.'],
    ['JOS.6.19', '¿De qué ciudad cayeron las murallas al sonar las trompetas?', 'De Jericó', 'De Babilonia', 'En Jericó, el pueblo gritó al sonar las trompetas y la muralla cayó.'],
    ['JDG.6.37', '¿Qué puso Gedeón en el suelo al pedir una señal?', 'Lana de oveja', 'Granos de trigo', 'Gedeón pidió que hubiera rocío en la lana y que el suelo quedara seco.'],
    ['JDG.16.17', '¿Qué no debía cortarse Sansón?', 'El cabello', 'La barba', 'Sansón contó a Dalila que nunca le habían cortado el cabello porque estaba consagrado a Dios.'],
    ['RUT.1.16', '¿Con quién fue Rut a Belén?', 'Con Noemí', 'Con Ester', 'Rut decidió quedarse con Noemí e ir a donde ella fuera.'],
    ['1SA.3.4', '¿A quién llamó Dios por su nombre de noche?', 'A Samuel', 'A Salomón', 'El joven Samuel oyó una voz y al principio pensó que lo llamaba Elí.'],
    ['1SA.17.49', '¿Con qué lanzó David una piedra a Goliat?', 'Con una honda', 'Con un arco', 'La piedra de la honda de David alcanzó a Goliat en la frente.'],
    ['1KI.3.9', '¿Qué le pidió Salomón a Dios?', 'Sabiduría', 'Riqueza', 'Salomón pidió un corazón entendido para juzgar al pueblo con justicia.'],
    ['1KI.18.38', '¿Qué cayó sobre el altar de Elías?', 'Fuego', 'Nieve', 'Después de que Elías oró, el fuego consumió la ofrenda y el agua que la rodeaba.'],
    ['2KI.5.14', '¿En qué río se lavó Naamán?', 'En el Jordán', 'En el Nilo', 'Siguiendo la palabra de Eliseo, Naamán se sumergió siete veces en el Jordán y sanó.'],
    ['JOB.1.20', '¿Qué hizo Job al oír las malas noticias?', 'Adoró a Dios', 'Se fue de caza', 'En su dolor, Job se rasgó el manto y se inclinó ante Dios.'],
    ['NEH.6.15', '¿Qué se reconstruyó en Jerusalén en tiempos de Nehemías?', 'La muralla de la ciudad', 'Un puente sobre un río', 'Pese a la oposición, terminaron la muralla de Jerusalén en 52 días.'],
    ['EST.7.3', '¿Por quiénes intercedió Ester ante el rey?', 'Por ella y su pueblo', 'Por los guardias reales', 'En el banquete, Ester pidió que se perdonara su vida y la de su pueblo.'],
    ['DAN.3.23', '¿Adónde arrojaron a los tres amigos de Daniel?', 'A un horno ardiente', 'A un pozo profundo', 'Los amigos se negaron a adorar la estatua y fueron arrojados al horno ardiente.'],
    ['DAN.6.16', '¿Con qué animales arrojaron a Daniel?', 'Con leones', 'Con osos', 'El rey mandó arrojar a Daniel al foso de los leones, pero Dios le conservó la vida.'],
    ['JON.2.1', '¿Qué se tragó a Jonás?', 'Un gran pez', 'Un cocodrilo', 'Jonás pasó tres días y tres noches dentro del gran pez.'],
    ['EZK.37.10', '¿Qué cobró vida en la visión de Ezequiel?', 'Huesos secos', 'Estatuas de piedra', 'En la visión de Ezequiel, los huesos cobraron vida y una multitud se puso de pie.'],
  ]);

  const newTestament = unpack('Nuevo Testamento', [
    ['LUK.1.31', '¿Cómo se llamaría el hijo de María, según el ángel?', 'Jesús', 'Juan', 'El ángel dijo a María que tendría un hijo y lo llamaría Jesús.'],
    ['LUK.1.13', '¿Quién era el padre de Juan el Bautista?', 'Zacarías', 'José', 'El ángel le dijo a Zacarías que Elisabet tendría un hijo llamado Juan.'],
    ['MAT.1.20', '¿Cómo se le apareció el ángel a José?', 'En un sueño', 'En una barca', 'En el sueño el ángel le dijo a José que recibiera a María y le explicó el origen del niño.'],
    ['LUK.2.4', '¿En qué ciudad nació Jesús?', 'En Belén', 'En Nazaret', 'José y María fueron de Nazaret a Belén para el censo. Allí nació Jesús.'],
    ['LUK.2.7', '¿Dónde acostó María al niño Jesús?', 'En un pesebre', 'En una cesta', 'María acostó a Jesús en un comedero para animales porque no había sitio para ellos en el alojamiento.'],
    ['LUK.2.15', '¿Quiénes fueron a Belén tras el anuncio del ángel?', 'Los pastores', 'Los pescadores', 'Los pastores oyeron del nacimiento del Salvador y fueron a verlo.'],
    ['MAT.2.2', '¿Qué vieron los sabios en el cielo?', 'Una estrella', 'Un arcoíris', 'Los sabios vieron una estrella y fueron a honrar al Rey recién nacido.'],
    ['MAT.2.11', '¿Cuál de estos regalos llevaron los sabios a Jesús?', 'Oro', 'Plata', 'Los sabios abrieron sus tesoros y ofrecieron oro, incienso y mirra.'],
    ['MAT.2.13', '¿Adónde llevó José a su familia para huir de Herodes?', 'A Egipto', 'A Roma', 'Un ángel advirtió a José del peligro y le dijo que huyera a Egipto.'],
    ['LUK.2.46', '¿Dónde encontraron a Jesús cuando tenía doce años?', 'En el templo', 'En el mercado', 'Jesús estaba sentado entre los maestros, escuchando y haciendo preguntas.'],
    ['MAT.3.13', '¿Quién bautizó a Jesús en el Jordán?', 'Juan el Bautista', 'El apóstol Pedro', 'Jesús vino de Galilea a Juan para que lo bautizara en el Jordán.'],
    ['MAT.4.1', '¿Adónde fue Jesús al comienzo de su tentación?', 'Al desierto', 'Al templo', 'El Espíritu llevó a Jesús al desierto, donde ayunó y fue tentado.'],
    ['MAT.4.18', '¿A qué se dedicaban Pedro y Andrés antes de su llamado?', 'Eran pescadores', 'Eran pastores', 'Jesús vio a los hermanos echando una red en el mar de Galilea.'],
    ['JHN.2.9', '¿En qué convirtió Jesús el agua en una boda?', 'En vino', 'En aceite', 'El encargado del banquete probó el agua convertida en vino.'],
    ['JHN.3.2', '¿Cuándo fue Nicodemo a ver a Jesús?', 'De noche', 'Al amanecer', 'Nicodemo llegó de noche y empezó a hablar con Jesús sobre las señales que hacía.'],
    ['JHN.4.7', '¿A quién le pidió agua Jesús junto al pozo?', 'A una samaritana', 'A un soldado romano', 'La petición de agua inició la conversación de Jesús con la samaritana.'],
    ['MRK.2.4', '¿Por dónde bajaron los amigos al enfermo hasta Jesús?', 'Por el techo', 'Por una ventana', 'Como la multitud bloqueaba el paso, bajaron la camilla por una abertura en el techo.'],
    ['MRK.4.39', '¿Qué calmó Jesús mientras estaba en la barca?', 'Una tormenta', 'Un incendio', 'Jesús ordenó al viento y al mar que se calmaran, y todo quedó en calma.'],
    ['MRK.5.41', '¿A quién tomó Jesús de la mano y le dijo que se levantara?', 'A la hija de Jairo', 'A la hermana de Pedro', 'Jesús tomó a la niña de la mano y le dijo que se levantara. Ella se levantó y caminó.'],
    ['MAT.14.17', '¿Con qué alimentó Jesús a cinco mil personas?', 'Con pan y pescado', 'Con pan y queso', 'Los discípulos tenían cinco panes y dos peces, y alcanzó para todos.'],
    ['MAT.14.29', '¿Quién salió de la barca y caminó sobre el agua hacia Jesús?', 'Pedro', 'Andrés', 'Cuando Jesús lo llamó, Pedro salió de la barca y caminó sobre el agua.'],
    ['LUK.10.33', '¿Quién ayudó al herido en la parábola de Jesús?', 'Un samaritano', 'Un sacerdote', 'El samaritano se compadeció del herido y cuidó de él.'],
    ['LUK.15.4', '¿Qué busca el pastor en la parábola de Jesús?', 'Una oveja perdida', 'Una cabra perdida', 'El pastor deja a noventa y nueve ovejas y busca a la que falta hasta encontrarla.'],
    ['LUK.15.20', '¿Quién corrió al encuentro del hijo pródigo?', 'Su padre', 'Su hermano mayor', 'El padre vio a su hijo desde lejos, corrió a su encuentro y lo abrazó.'],
    ['LUK.17.15', '¿Cuántos de los sanados volvieron para dar gracias a Jesús?', 'Uno', 'Los diez', 'Uno de los diez hombres sanados volvió alabando a Dios.'],
    ['LUK.19.4', '¿Qué hizo Zaqueo para ver a Jesús?', 'Se subió a un árbol', 'Se subió a un tejado', 'Zaqueo era bajo y se subió a un árbol para ver a Jesús por encima de la multitud.'],
    ['JHN.11.43', '¿A quién llamó Jesús para que saliera de la tumba?', 'A Lázaro', 'A José', 'Jesús llamó a Lázaro en voz alta, y él salió vivo de la tumba.'],
    ['MAT.17.2', '¿Qué pasó con el rostro de Jesús en la Transfiguración?', 'Resplandeció', 'Se oscureció', 'En el monte el rostro de Jesús resplandeció y su ropa se volvió luminosa.'],
    ['MRK.12.42', '¿Qué echó la viuda pobre en el arca de las ofrendas?', 'Dos moneditas', 'Un anillo de oro', 'La viuda dio dos monedas pequeñas. Jesús llamó la atención de sus discípulos sobre su generosidad.'],
    ['MAT.21.5', '¿En qué animal entró Jesús en Jerusalén?', 'En un asno', 'En un camello', 'Jesús entró como Rey humilde, montado en un asno.'],
    ['JHN.13.5', '¿Qué les lavó Jesús a sus discípulos durante la cena?', 'Los pies', 'Las manos', 'Jesús les lavó los pies a sus discípulos y les dio un ejemplo de servicio.'],
    ['MAT.26.26', '¿Qué partió Jesús en la última cena?', 'El pan', 'El pescado', 'Jesús bendijo el pan, lo partió y lo dio a sus discípulos.'],
    ['MAT.26.36', '¿Dónde oró Jesús antes de su arresto?', 'En Getsemaní', 'En Nazaret', 'Jesús llegó con los discípulos a Getsemaní y se apartó para orar.'],
    ['MAT.26.48', '¿Qué señal usó Judas para identificar a Jesús?', 'Un beso', 'Un gesto con la mano', 'Judas acordó besar a aquel a quien debían arrestar.'],
    ['MAT.26.75', '¿Cuántas veces negó Pedro a Jesús?', 'Tres veces', 'Una vez', 'Al oír cantar al gallo, Pedro recordó las palabras de Jesús y lloró.'],
    ['MAT.27.33', '¿Cómo se llamaba el lugar donde crucificaron a Jesús?', 'Gólgota', 'Betania', 'El Evangelio explica que Gólgota significa Lugar de la Calavera.'],
    ['MAT.27.60', '¿Dónde puso José de Arimatea el cuerpo de Jesús?', 'En una tumba excavada en roca', 'En el templo', 'José puso el cuerpo de Jesús en su tumba nueva y rodó una piedra ante la entrada.'],
    ['MRK.16.6', '¿Qué noticia oyeron las mujeres en la tumba?', 'Jesús había resucitado', 'La tumba estaba cerrada', 'En la tumba vacía les dijeron a las mujeres que Jesús había resucitado.'],
    ['JHN.20.16', '¿A quién llamó por su nombre Jesús resucitado junto a la tumba?', 'A María Magdalena', 'A Elisabet', 'Cuando Jesús llamó a María por su nombre, ella reconoció a su Maestro.'],
    ['JHN.20.27', '¿A quién invitó Jesús a ver sus heridas tras resucitar?', 'A Tomás', 'A Judas Iscariote', 'Jesús invitó a Tomás a ver sus heridas y Tomás creyó.'],
    ['LUK.24.35', '¿Cuándo reconocieron a Jesús los discípulos en Emaús?', 'Cuando partió el pan', 'Cuando abrió la puerta', 'Los dos discípulos contaron que reconocieron a Jesús al partir el pan.'],
    ['ACT.1.9', '¿Qué ocultó a Jesús en la ascensión?', 'Una nube', 'La niebla sobre el río', 'Los discípulos vieron subir a Jesús hasta que una nube lo ocultó de su vista.'],
    ['ACT.2.3', '¿A qué se parecían las lenguas en Pentecostés?', 'Al fuego', 'A gotas de agua', 'Sobre los presentes aparecieron lenguas como de fuego y se llenaron del Espíritu Santo.'],
    ['ACT.3.6', '¿Qué le dijo Pedro al hombre que no podía caminar?', 'Levántate y camina', 'Ve al río', 'En la puerta del templo, Pedro le dijo en el nombre de Jesús que se levantara, y el hombre caminó.'],
    ['ACT.9.3', '¿A qué ciudad se acercaba Saulo cuando vio una luz?', 'A Damasco', 'A Belén', 'Camino a Damasco una luz del cielo rodeó a Saulo y él oyó la voz de Jesús.'],
    ['ACT.9.17', '¿Quién visitó a Saulo cuando quedó ciego en Damasco?', 'Ananías', 'Tomás', 'El Señor envió a Ananías a Saulo, y Saulo recuperó la vista.'],
    ['ACT.16.26', '¿Qué sacudió la cárcel donde estaban Pablo y Silas?', 'Un terremoto', 'Un aguacero', 'Tras el terremoto se abrieron las puertas de la cárcel y se soltaron las cadenas de los presos.'],
    ['ACT.28.3', '¿Qué animal se prendió de la mano de Pablo?', 'Una serpiente', 'Un lagarto', 'Cuando Pablo echó leña al fuego, una serpiente salió huyendo del calor y se prendió de su mano.'],
    ['REV.1.9', '¿En qué isla recibió Juan el Apocalipsis?', 'En Patmos', 'En Creta', 'Juan cuenta que estaba en la isla de Patmos cuando recibió la visión.'],
    ['REV.21.2', '¿Qué ciudad vio Juan descender del cielo?', 'La Nueva Jerusalén', 'La Nueva Babilonia', 'En la visión, la ciudad santa, la Nueva Jerusalén, descendió del cielo de parte de Dios.'],
  ]);

  function shuffle(questions) {
    const deck = [...questions];
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[other]] = [deck[other], deck[index]];
    }
    return deck;
  }

  function buildDeck() {
    const old = shuffle(oldTestament);
    const recent = shuffle(newTestament);
    const deck = [];
    const startsWithOld = Math.random() < .5;
    while (old.length && recent.length) {
      if (startsWithOld) deck.push(old.pop(), recent.pop());
      else deck.push(recent.pop(), old.pop());
    }
    return deck.concat(old.reverse(), recent.reverse());
  }

  window.NileBibleStudy = { buildDeck };
})();
