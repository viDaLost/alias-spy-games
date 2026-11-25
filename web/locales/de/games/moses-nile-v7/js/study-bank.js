(() => {
  'use strict';

  const bookNames = {
    'GEN': '1. Mose',
    'EXO': '2. Mose',
    'NUM': '4. Mose',
    'JOS': 'Josua',
    'JDG': 'Richter',
    'RUT': 'Rut',
    '1SA': '1. Samuel',
    '1KI': '1. Könige',
    '2KI': '2. Könige',
    'JOB': 'Hiob',
    'NEH': 'Nehemia',
    'EST': 'Ester',
    'DAN': 'Daniel',
    'JON': 'Jona',
    'EZK': 'Hesekiel',
    'MAT': 'Matthäus',
    'MRK': 'Markus',
    'LUK': 'Lukas',
    'JHN': 'Johannes',
    'ACT': 'Apostelgeschichte',
    'REV': 'Offenbarung',
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

  const oldTestament = unpack('Altes Testament', [
    ['GEN.2.8', 'Wo lebten Adam und Eva zuerst?', 'In Eden', 'In Ägypten', 'Gott legte in Eden einen Garten an und setzte Adam dorthin.'],
    ['GEN.2.22', 'Woraus erschuf Gott Eva?', 'Aus Adams Rippe', 'Aus einem Stein', 'Gott nahm eine Rippe des schlafenden Adam und formte daraus Eva.'],
    ['GEN.4.8', 'Wer war Abels Bruder?', 'Kain', 'Noah', 'Abel und Kain waren Söhne von Adam und Eva.'],
    ['GEN.6.14', 'Was sollte Noah auf Gottes Anweisung bauen?', 'Eine Arche', 'Einen Turm', 'Die Arche schützte Noahs Familie und die Tiere während der Flut.'],
    ['GEN.8.11', 'Was brachte die Taube Noah?', 'Ein Olivenblatt', 'Einen Palmzweig', 'Am frischen Blatt erkannte Noah, dass das Wasser gesunken war.'],
    ['GEN.9.13', 'Welches Zeichen gab Gott nach der Flut?', 'Einen Regenbogen', 'Einen Neumond', 'Der Regenbogen war das Zeichen für Gottes Bund mit der Erde.'],
    ['GEN.11.7', 'Was geschah mit der Sprache der Bauleute in Babel?', 'Sie verstanden sich nicht mehr', 'Alle sprachen gleich', 'Gott verwirrte ihre Sprachen, und der Bau wurde eingestellt.'],
    ['GEN.12.1', 'Was sollte Abraham auf Gottes Anweisung tun?', 'In ein anderes Land ziehen', 'Einen Palast bauen', 'Gott rief Abraham aus seiner Heimat und zeigte ihm einen neuen Weg.'],
    ['GEN.21.3', 'Wie hieß der Sohn von Abraham und Sara?', 'Isaak', 'Josef', 'Isaak wurde Abraham und Sara im hohen Alter geboren, wie Gott es versprochen hatte.'],
    ['GEN.22.13', 'Welches Tier sah Abraham im Gebüsch?', 'Einen Widder', 'Einen Hirsch', 'Der Widder hing mit den Hörnern fest, und Abraham opferte ihn an Isaaks Stelle.'],
    ['GEN.24.19', 'Welchen Tieren gab Rebekka am Brunnen Wasser?', 'Kamelen', 'Schafen', 'Rebekka gab einem Reisenden zu trinken und bot an, auch seine Kamele zu tränken.'],
    ['GEN.25.34', 'Woraus bestand Jakobs Eintopf?', 'Aus Linsen', 'Aus Weizen', 'Esau bekam Brot und Linseneintopf und gab Jakob dafür sein Erstgeburtsrecht.'],
    ['GEN.28.12', 'Was sah Jakob im Traum?', 'Eine Leiter bis zum Himmel', 'Ein Schiff auf dem Meer', 'Engel stiegen auf der Leiter in Jakobs Traum hinauf und hinab.'],
    ['GEN.32.28', 'Welchen neuen Namen bekam Jakob?', 'Israel', 'Juda', 'Nach dem nächtlichen Kampf erhielt Jakob den Namen Israel.'],
    ['GEN.37.3', 'Was schenkte Josefs Vater ihm?', 'Ein besonderes Gewand', 'Einen goldenen Becher', 'Jakob liebte Josef besonders und machte ihm ein schönes Gewand.'],
    ['GEN.41.25', 'Wer deutete die Träume des Pharaos?', 'Josef', 'Benjamin', 'Josef erklärte, dass beide Träume des Pharaos dieselbe Botschaft Gottes enthielten.'],
    ['GEN.45.3', 'Wem gab sich Josef in Ägypten zu erkennen?', 'Seinen Brüdern', 'Den Soldaten des Pharaos', 'Seine Brüder erkannten Josef in Ägypten erst, als er ihnen sagte, wer er war.'],
    ['EXO.2.2', 'Wie lange versteckte Moses Mutter ihr Baby?', 'Drei Monate', 'Einen Monat', 'Sie versteckte ihren Sohn drei Monate lang und bereitete dann einen Korb vor.'],
    ['EXO.2.3', 'Woraus bestand Moses Korb?', 'Aus Schilf', 'Aus Holz', 'Seine Mutter dichtete den Schilfkorb mit Pech ab und stellte ihn ans Ufer.'],
    ['EXO.2.4', 'Wer beobachtete Moses Korb?', 'Seine Schwester', 'Sein Vater', 'Seine Schwester blieb in einiger Entfernung stehen, um zu sehen, was mit ihm geschah.'],
    ['EXO.2.5', 'Wer entdeckte den Korb im Schilf?', 'Die Tochter des Pharaos', 'Eine Dienerin', 'Die Tochter des Pharaos sah den Korb und ließ ihn von einer Dienerin holen.'],
    ['EXO.2.9', 'Wer stillte Mose als Baby?', 'Seine Mutter', 'Die Tochter des Pharaos', 'Moses Schwester holte seine Mutter, die ihn auf Bitte der Tochter des Pharaos stillte.'],
    ['EXO.2.10', 'Warum wurde das Baby Mose genannt?', 'Es kam aus dem Wasser', 'Sein Vater hieß so', 'Die Tochter des Pharaos erklärte den Namen damit, dass sie das Kind aus dem Wasser gezogen hatte.'],
    ['EXO.3.2', 'Was brannte vor Mose, ohne zu verbrennen?', 'Ein Busch', 'Eine Fackel', 'Mose sah Flammen in einem Busch, doch die Zweige verbrannten nicht.'],
    ['EXO.4.14', 'Wer war Moses Bruder?', 'Aaron', 'Abraham', 'Gott schickte Aaron Mose entgegen, damit er ihm beim Reden half.'],
    ['EXO.7.20', 'Wozu wurde das Wasser des Nils?', 'Zu Blut', 'Zu Öl', 'Als Aaron mit seinem Stab auf den Fluss schlug, wurde das Wasser zu Blut.'],
    ['EXO.12.7', 'Was wurde in der Passanacht mit Blut markiert?', 'Die Türen der Häuser', 'Die Dächer der Häuser', 'Mit dem Blut des Lammes markierten die Menschen die Seiten und die Oberkante der Tür.'],
    ['EXO.14.21', 'Was teilte sich vor Mose?', 'Das Meer', 'Die Berge', 'Gott trieb das Wasser mit starkem Wind zurück, und das Volk ging auf trockenem Boden hindurch.'],
    ['EXO.16.15', 'Wie hieß die Nahrung der Israeliten in der Wüste?', 'Manna', 'Feigen', 'Als das Volk unbekannte Nahrung am Boden fand, erklärte Mose, Gott habe ihnen Brot gegeben.'],
    ['EXO.17.6', 'Woher bekam Mose in der Wüste Wasser?', 'Aus einem Felsen', 'Aus einem Brunnen', 'Mose schlug mit seinem Stab gegen den Felsen, und Wasser floss heraus.'],
    ['EXO.31.18', 'Worauf standen die Gebote am Sinai?', 'Auf Steintafeln', 'Auf Holzbrettern', 'Am Sinai gab Gott Mose zwei Steintafeln.'],
    ['EXO.32.4', 'Welches Götzenbild entstand am Sinai?', 'Ein goldenes Kalb', 'Ein silberner Löwe', 'Aaron fertigte das Kalb aus dem Schmuck an, den das Volk brachte.'],
    ['NUM.21.9', 'Was stellte Mose auf einer Stange auf?', 'Eine bronzene Schlange', 'Ein weißes Tuch', 'Wer gebissen worden war, blickte auf die bronzene Schlange und blieb am Leben.'],
    ['JOS.3.17', 'Welchen Fluss überquerte das Volk unter Josua?', 'Den Jordan', 'Den Nil', 'Die Priester mit der Bundeslade standen trocken im Jordan, während das Volk hinüberging.'],
    ['JOS.6.19', 'Welche Stadtmauer fiel nach dem Klang der Hörner?', 'Die von Jericho', 'Die von Babylon', 'In Jericho rief das Volk beim Klang der Hörner, und die Stadtmauer fiel.'],
    ['JDG.6.37', 'Was legte Gideon aus, als er um ein Zeichen bat?', 'Ein Schaffell', 'Weizenkörner', 'Gideon bat um Tau auf dem Fell, während der Boden ringsum trocken bleiben sollte.'],
    ['JDG.16.17', 'Was durfte bei Simson nicht geschnitten werden?', 'Sein Haar', 'Sein Bart', 'Simson erzählte Delila, dass sein Haar nie geschnitten worden war, weil er Gott geweiht war.'],
    ['RUT.1.16', 'Mit wem ging Rut nach Bethlehem?', 'Mit Noomi', 'Mit Ester', 'Rut entschied, bei Noomi zu bleiben und mit ihr zu gehen.'],
    ['1SA.3.4', 'Wen rief Gott nachts beim Namen?', 'Samuel', 'Salomo', 'Der junge Samuel hörte eine Stimme und dachte zuerst, Eli hätte ihn gerufen.'],
    ['1SA.17.49', 'Womit schleuderte David einen Stein auf Goliat?', 'Mit einer Schleuder', 'Mit einem Bogen', 'Der Stein aus Davids Schleuder traf Goliat an der Stirn.'],
    ['1KI.3.9', 'Worum bat Salomo Gott?', 'Um Weisheit', 'Um Reichtum', 'Salomo bat um ein verständiges Herz, um das Volk gerecht zu richten.'],
    ['1KI.18.38', 'Was kam auf Elias Altar herab?', 'Feuer', 'Schnee', 'Nach Elias Gebet verzehrte das Feuer das Opfer und das Wasser ringsum.'],
    ['2KI.5.14', 'In welchem Fluss wusch sich Naaman?', 'Im Jordan', 'Im Nil', 'Auf Elisas Wort hin tauchte Naaman siebenmal im Jordan unter und wurde geheilt.'],
    ['JOB.1.20', 'Was tat Hiob nach den schlechten Nachrichten?', 'Er betete Gott an', 'Er ging jagen', 'In seiner Trauer zerriss Hiob sein Gewand und warf sich vor Gott nieder.'],
    ['NEH.6.15', 'Was wurde unter Nehemia in Jerusalem wieder aufgebaut?', 'Die Stadtmauer', 'Eine Brücke über einen Fluss', 'Trotz Widerstands vollendeten die Bauleute Jerusalems Mauer in 52 Tagen.'],
    ['EST.7.3', 'Für wen bat Ester den König?', 'Für sich und ihr Volk', 'Für die königliche Wache', 'Beim Gastmahl bat Ester darum, ihr Leben und das Leben ihres Volkes zu verschonen.'],
    ['DAN.3.23', 'Wohin wurden Daniels drei Freunde geworfen?', 'In einen Feuerofen', 'In einen tiefen Brunnen', 'Die Freunde weigerten sich, das Standbild anzubeten, und wurden in den glühenden Ofen geworfen.'],
    ['DAN.6.16', 'Zu welchen Tieren wurde Daniel geworfen?', 'Zu Löwen', 'Zu Bären', 'Der König ließ Daniel in die Löwengrube werfen, doch Gott bewahrte sein Leben.'],
    ['JON.2.1', 'Was verschluckte Jona?', 'Ein großer Fisch', 'Ein Krokodil', 'Jona verbrachte drei Tage und drei Nächte im Bauch des großen Fisches.'],
    ['EZK.37.10', 'Was wurde in Hesekiels Vision lebendig?', 'Trockene Knochen', 'Steinerne Statuen', 'In Hesekiels Vision wurden die Knochen lebendig, und viele Menschen standen auf.'],
  ]);

  const newTestament = unpack('Neues Testament', [
    ['LUK.1.31', 'Wie sollte Marias Sohn laut dem Engel heißen?', 'Jesus', 'Johannes', 'Der Engel sagte Maria, dass sie einen Sohn bekommen und ihn Jesus nennen würde.'],
    ['LUK.1.13', 'Wer war der Vater von Johannes dem Täufer?', 'Zacharias', 'Josef', 'Der Engel sagte Zacharias, dass Elisabet einen Sohn bekommen und ihn Johannes nennen würde.'],
    ['MAT.1.20', 'Wie erschien der Engel Josef?', 'Im Traum', 'Auf einem Boot', 'Im Traum sagte der Engel Josef, er solle Maria zu sich nehmen, und erklärte ihm die Herkunft des Kindes.'],
    ['LUK.2.4', 'In welcher Stadt wurde Jesus geboren?', 'In Bethlehem', 'In Nazareth', 'Josef und Maria kamen zur Volkszählung von Nazareth nach Bethlehem. Dort wurde Jesus geboren.'],
    ['LUK.2.7', 'Wohin legte Maria das Jesuskind?', 'In eine Krippe', 'In einen Korb', 'Maria legte Jesus in einen Futtertrog, weil es für sie keinen Platz in der Herberge gab.'],
    ['LUK.2.15', 'Wer ging nach der Engelsbotschaft nach Bethlehem?', 'Hirten', 'Fischer', 'Die Hirten hörten von der Geburt des Retters und gingen, um ihn zu sehen.'],
    ['MAT.2.2', 'Was sahen die Sterndeuter am Himmel?', 'Einen Stern', 'Einen Regenbogen', 'Die Sterndeuter sahen einen Stern und kamen, um den neugeborenen König zu ehren.'],
    ['MAT.2.11', 'Welches dieser Geschenke brachten die Sterndeuter Jesus?', 'Gold', 'Silber', 'Die Sterndeuter öffneten ihre Schätze und brachten Gold, Weihrauch und Myrrhe.'],
    ['MAT.2.13', 'Wohin brachte Josef seine Familie vor Herodes in Sicherheit?', 'Nach Ägypten', 'Nach Rom', 'Ein Engel warnte Josef vor der Gefahr und sagte ihm, er solle nach Ägypten fliehen.'],
    ['LUK.2.46', 'Wo wurde Jesus gefunden, als er zwölf Jahre alt war?', 'Im Tempel', 'Auf dem Markt', 'Jesus saß mitten unter den Lehrern, hörte zu und stellte Fragen.'],
    ['MAT.3.13', 'Wer taufte Jesus im Jordan?', 'Johannes der Täufer', 'Der Apostel Petrus', 'Jesus kam aus Galiläa zu Johannes, um sich im Jordan taufen zu lassen.'],
    ['MAT.4.1', 'Wohin ging Jesus zu Beginn seiner Versuchung?', 'In die Wüste', 'In den Tempel', 'Der Geist führte Jesus in die Wüste, wo er fastete und Versuchungen erlebte.'],
    ['MAT.4.18', 'Was waren Petrus und Andreas vor ihrer Berufung?', 'Fischer', 'Hirten', 'Jesus sah die Brüder am See Genezareth, als sie ein Netz auswarfen.'],
    ['JHN.2.9', 'Wozu machte Jesus bei einer Hochzeit das Wasser?', 'Zu Wein', 'Zu Öl', 'Der Festleiter probierte das Wasser, das zu Wein geworden war.'],
    ['JHN.3.2', 'Wann kam Nikodemus zu Jesus?', 'Nachts', 'Bei Sonnenaufgang', 'Nikodemus kam nachts und sprach Jesus auf seine Zeichen an.'],
    ['JHN.4.7', 'Wen bat Jesus am Brunnen um Wasser?', 'Eine Samariterin', 'Einen römischen Soldaten', 'Mit der Bitte um Wasser begann das Gespräch Jesu mit der Samariterin.'],
    ['MRK.2.4', 'Wodurch ließen die Freunde den Kranken zu Jesus hinunter?', 'Durch das Dach', 'Durch ein Fenster', 'Die Menge versperrte den Weg, deshalb ließen sie die Trage durch eine Öffnung im Dach hinunter.'],
    ['MRK.4.39', 'Was stillte Jesus, als er im Boot war?', 'Einen Sturm', 'Ein Feuer', 'Jesus befahl Wind und Meer, still zu werden, und es wurde ruhig.'],
    ['MRK.5.41', 'Wen nahm Jesus an der Hand und rief zum Aufstehen?', 'Die Tochter des Jairus', 'Die Schwester des Petrus', 'Jesus nahm das Mädchen an der Hand und rief es zum Aufstehen. Es stand auf und ging umher.'],
    ['MAT.14.17', 'Womit speiste Jesus fünftausend Menschen?', 'Mit Brot und Fisch', 'Mit Brot und Käse', 'Die Jünger hatten fünf Brote und zwei Fische, und das Essen reichte für alle.'],
    ['MAT.14.29', 'Wer stieg aus dem Boot und ging über das Wasser zu Jesus?', 'Petrus', 'Andreas', 'Auf Jesu Wort hin stieg Petrus aus dem Boot und ging über das Wasser.'],
    ['LUK.10.33', 'Wer half dem Verletzten im Gleichnis Jesu?', 'Ein Samariter', 'Ein Priester', 'Der Samariter hatte Mitleid mit dem Verletzten und kümmerte sich um ihn.'],
    ['LUK.15.4', 'Was sucht der Hirte im Gleichnis Jesu?', 'Ein verlorenes Schaf', 'Eine verlorene Ziege', 'Der Hirte lässt neunundneunzig Schafe zurück und sucht, bis er das verlorene findet.'],
    ['LUK.15.20', 'Wer lief dem verlorenen Sohn entgegen?', 'Sein Vater', 'Sein älterer Bruder', 'Der Vater sah seinen Sohn von Weitem, lief ihm entgegen und umarmte ihn.'],
    ['LUK.17.15', 'Wie viele Geheilte kamen zurück, um Jesus zu danken?', 'Einer', 'Alle zehn', 'Einer der zehn Geheilten kam zurück und lobte Gott.'],
    ['LUK.19.4', 'Was tat Zachäus, um Jesus zu sehen?', 'Er kletterte auf einen Baum', 'Er stieg auf ein Dach', 'Zachäus war klein und kletterte auf einen Baum, um über die Menge hinweg Jesus zu sehen.'],
    ['JHN.11.43', 'Wen rief Jesus aus dem Grab heraus?', 'Lazarus', 'Josef', 'Jesus rief Lazarus mit lauter Stimme, und er kam lebend aus dem Grab.'],
    ['MAT.17.2', 'Was geschah mit Jesu Gesicht bei der Verklärung?', 'Es leuchtete', 'Es wurde dunkel', 'Auf dem Berg leuchtete Jesu Gesicht, und seine Kleider wurden hell.'],
    ['MRK.12.42', 'Was legte die arme Witwe in den Opferkasten?', 'Zwei kleine Münzen', 'Einen goldenen Ring', 'Die Witwe gab zwei kleine Münzen. Jesus machte seine Jünger auf ihre Großzügigkeit aufmerksam.'],
    ['MAT.21.5', 'Worauf ritt Jesus in Jerusalem ein?', 'Auf einem Esel', 'Auf einem Kamel', 'Jesus zog als sanftmütiger König auf einem Esel in die Stadt ein.'],
    ['JHN.13.5', 'Was wusch Jesus seinen Jüngern beim Abendessen?', 'Die Füße', 'Die Hände', 'Jesus wusch seinen Jüngern die Füße und gab ihnen ein Beispiel des Dienens.'],
    ['MAT.26.26', 'Was brach Jesus beim letzten Abendmahl?', 'Brot', 'Fisch', 'Jesus segnete das Brot, brach es und gab es seinen Jüngern.'],
    ['MAT.26.36', 'Wo betete Jesus vor seiner Verhaftung?', 'In Gethsemane', 'In Nazareth', 'Jesus kam mit seinen Jüngern nach Gethsemane und ging ein Stück weiter, um zu beten.'],
    ['MAT.26.48', 'Mit welchem Zeichen zeigte Judas, wer Jesus war?', 'Mit einem Kuss', 'Mit einem Winken', 'Judas verabredete, denjenigen zu küssen, den sie festnehmen sollten.'],
    ['MAT.26.75', 'Wie oft verleugnete Petrus Jesus?', 'Dreimal', 'Einmal', 'Als der Hahn krähte, erinnerte sich Petrus an Jesu Worte und weinte.'],
    ['MAT.27.33', 'Wie hieß der Ort der Kreuzigung Jesu?', 'Golgatha', 'Bethanien', 'Das Evangelium erklärt, dass Golgatha Schädelstätte bedeutet.'],
    ['MAT.27.60', 'Wo bestattete Josef von Arimathäa Jesus?', 'In einem Felsengrab', 'Im Tempel', 'Josef legte Jesu Leichnam in sein neues Grab und rollte einen Stein vor den Eingang.'],
    ['MRK.16.6', 'Welche Nachricht hörten die Frauen am Grab?', 'Jesus ist auferstanden', 'Das Grab ist verschlossen', 'Am leeren Grab erfuhren die Frauen, dass Jesus auferstanden war.'],
    ['JHN.20.16', 'Wen rief der auferstandene Jesus am Grab beim Namen?', 'Maria Magdalena', 'Elisabet', 'Als Jesus Maria beim Namen rief, erkannte sie ihren Lehrer.'],
    ['JHN.20.27', 'Wem zeigte Jesus nach der Auferstehung seine Wunden?', 'Thomas', 'Judas Iskariot', 'Jesus lud Thomas ein, seine Wunden anzusehen, und Thomas glaubte.'],
    ['LUK.24.35', 'Wann erkannten die Jünger in Emmaus Jesus?', 'Als er das Brot brach', 'Als er die Tür öffnete', 'Die beiden Jünger erzählten, dass sie Jesus erkannten, als er das Brot brach.'],
    ['ACT.1.9', 'Was verbarg Jesus bei der Himmelfahrt?', 'Eine Wolke', 'Nebel über dem Fluss', 'Die Jünger sahen Jesus aufsteigen, bis eine Wolke ihn ihrem Blick entzog.'],
    ['ACT.2.3', 'Wie sahen die Zungen an Pfingsten aus?', 'Wie Feuer', 'Wie Wassertropfen', 'Über den Versammelten erschienen Zungen wie Feuer, und sie wurden mit dem Heiligen Geist erfüllt.'],
    ['ACT.3.6', 'Was sagte Petrus dem Mann, der nicht gehen konnte?', 'Steh auf und geh', 'Geh zum Fluss', 'Am Tempeltor rief Petrus den Mann im Namen Jesu zum Aufstehen, und er ging.'],
    ['ACT.9.3', 'Welcher Stadt näherte sich Saulus, als er ein Licht sah?', 'Damaskus', 'Bethlehem', 'Auf dem Weg nach Damaskus umstrahlte Saulus ein Licht vom Himmel, und er hörte Jesu Stimme.'],
    ['ACT.9.17', 'Wer besuchte den erblindeten Saulus in Damaskus?', 'Hananias', 'Thomas', 'Der Herr sandte Hananias zu Saulus, und Saulus konnte wieder sehen.'],
    ['ACT.16.26', 'Was erschütterte das Gefängnis von Paulus und Silas?', 'Ein Erdbeben', 'Starker Regen', 'Nach dem Erdbeben öffneten sich die Gefängnistüren, und die Fesseln der Gefangenen lösten sich.'],
    ['ACT.28.3', 'Welches Tier hing an der Hand des Paulus?', 'Eine Schlange', 'Eine Eidechse', 'Als Paulus Reisig ins Feuer legte, kroch eine Schlange vor der Hitze heraus und biss sich an seiner Hand fest.'],
    ['REV.1.9', 'Auf welcher Insel empfing Johannes die Offenbarung?', 'Auf Patmos', 'Auf Kreta', 'Johannes berichtet, dass er bei seiner Vision auf der Insel Patmos war.'],
    ['REV.21.2', 'Welche Stadt sah Johannes vom Himmel herabkommen?', 'Das neue Jerusalem', 'Das neue Babylon', 'In der Vision kam die heilige Stadt, das neue Jerusalem, von Gott aus dem Himmel herab.'],
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
