(() => {
  'use strict';

  const bookNames = {
    'GEN': 'Genesis',
    'EXO': 'Exodus',
    'NUM': 'Numbers',
    'JOS': 'Joshua',
    'JDG': 'Judges',
    'RUT': 'Ruth',
    '1SA': '1 Samuel',
    '1KI': '1 Kings',
    '2KI': '2 Kings',
    'JOB': 'Job',
    'NEH': 'Nehemiah',
    'EST': 'Esther',
    'DAN': 'Daniel',
    'JON': 'Jonah',
    'EZK': 'Ezekiel',
    'MAT': 'Matthew',
    'MRK': 'Mark',
    'LUK': 'Luke',
    'JHN': 'John',
    'ACT': 'Acts',
    'REV': 'Revelation',
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

  const oldTestament = unpack('Old Testament', [
    ['GEN.2.8', 'Where did Adam and Eve first live?', 'In Eden', 'In Egypt', 'God planted a garden in Eden and put Adam there.'],
    ['GEN.2.22', 'What did God make Eve from?', 'Adam’s rib', 'A stone', 'God took a rib from the sleeping Adam and made Eve from it.'],
    ['GEN.4.8', 'Who was Abel’s brother?', 'Cain', 'Noah', 'Abel and Cain were sons of Adam and Eve.'],
    ['GEN.6.14', 'What did God tell Noah to build?', 'An ark', 'A tower', 'The ark sheltered Noah’s family and the animals during the flood.'],
    ['GEN.8.11', 'What did the dove bring Noah?', 'An olive leaf', 'A palm branch', 'The fresh leaf showed Noah that the water had gone down.'],
    ['GEN.9.13', 'What sign did God give after the flood?', 'A rainbow', 'A new moon', 'The rainbow marked God’s covenant with the earth.'],
    ['GEN.11.7', 'What happened to the builders’ speech at Babel?', 'They stopped understanding each other', 'Everyone spoke the same way', 'God confused their languages, and the building stopped.'],
    ['GEN.12.1', 'What did God tell Abraham to do?', 'Go to another land', 'Build a palace', 'God called Abraham away from his homeland and showed him a new path.'],
    ['GEN.21.3', 'What was Abraham and Sarah’s son called?', 'Isaac', 'Joseph', 'Isaac was born in Abraham and Sarah’s old age, as God had promised.'],
    ['GEN.22.13', 'What animal did Abraham see in the bushes?', 'A ram', 'A deer', 'The ram was caught by its horns, and Abraham offered it in Isaac’s place.'],
    ['GEN.24.19', 'Which animals did Rebekah water at the well?', 'Camels', 'Sheep', 'Rebekah gave a traveler a drink and then offered to water his camels.'],
    ['GEN.25.34', 'What was Jacob’s stew made from?', 'Lentils', 'Wheat', 'Esau received bread and lentil stew in exchange for his birthright.'],
    ['GEN.28.12', 'What did Jacob see in a dream?', 'A ladder to heaven', 'A ship at sea', 'Angels went up and down the ladder in Jacob’s dream.'],
    ['GEN.32.28', 'What new name did Jacob receive?', 'Israel', 'Judah', 'Jacob received the name Israel after wrestling through the night.'],
    ['GEN.37.3', 'What did Joseph’s father give him?', 'A special robe', 'A gold cup', 'Jacob loved Joseph especially and made him a fine robe.'],
    ['GEN.41.25', 'Who explained Pharaoh’s dreams?', 'Joseph', 'Benjamin', 'Joseph explained that Pharaoh’s two dreams carried one message from God.'],
    ['GEN.45.3', 'To whom did Joseph reveal his name in Egypt?', 'His brothers', 'Pharaoh’s soldiers', 'His brothers did not recognize Joseph in Egypt until he told them who he was.'],
    ['EXO.2.2', 'How long did Moses’ mother hide him as a baby?', 'Three months', 'One month', 'She hid her son for three months and then prepared a basket.'],
    ['EXO.2.3', 'What was Moses’ basket made of?', 'Reeds', 'Wood', 'His mother sealed the reed basket with pitch and set it beside the riverbank.'],
    ['EXO.2.4', 'Who watched over Moses’ basket?', 'His sister', 'His father', 'His sister stood at a distance to see what would happen to her brother.'],
    ['EXO.2.5', 'Who noticed the basket among the reeds?', 'Pharaoh’s daughter', 'A servant', 'Pharaoh’s daughter saw the basket and sent a servant to fetch it.'],
    ['EXO.2.9', 'Who nursed Moses as a baby?', 'His mother', 'Pharaoh’s daughter', 'Moses’ sister brought his mother, and Pharaoh’s daughter asked her to nurse him.'],
    ['EXO.2.10', 'Why was the baby named Moses?', 'Drawn out of the water', 'It was his father’s name', 'Pharaoh’s daughter linked the name to drawing the boy out of the water.'],
    ['EXO.3.2', 'What burned before Moses without burning up?', 'A bush', 'A torch', 'Moses saw a flame in a bush, but the fire did not consume the branches.'],
    ['EXO.4.14', 'Who was Moses’ brother?', 'Aaron', 'Abraham', 'God sent Aaron to meet Moses and help him speak.'],
    ['EXO.7.20', 'What did the Nile’s water turn into?', 'Blood', 'Oil', 'When Aaron struck the river with his staff, the water turned into blood.'],
    ['EXO.12.7', 'What was marked with blood on Passover night?', 'The doors of houses', 'The roofs of houses', 'The lamb’s blood marked the sides and top of the doorway.'],
    ['EXO.14.21', 'What parted before Moses?', 'The sea', 'The mountains', 'God drove the water back with a strong wind, and the people crossed on dry ground.'],
    ['EXO.16.15', 'What was the Israelites’ food in the desert called?', 'Manna', 'Figs', 'When the people found unfamiliar food on the ground, Moses said God had given them bread.'],
    ['EXO.17.6', 'Where did Moses get water in the desert?', 'From a rock', 'From a well', 'Moses struck the rock with his staff and water flowed from it.'],
    ['EXO.31.18', 'What were the commandments written on at Sinai?', 'Stone tablets', 'Wooden boards', 'God gave Moses two stone tablets at Sinai.'],
    ['EXO.32.4', 'What idol did the people make at Mount Sinai?', 'A golden calf', 'A silver lion', 'Aaron made the calf from jewelry the people brought.'],
    ['NUM.21.9', 'What did Moses raise on a pole?', 'A bronze snake', 'A white cloth', 'Those who had been bitten looked at the bronze snake and lived.'],
    ['JOS.3.17', 'What river did the people cross under Joshua?', 'The Jordan', 'The Nile', 'The priests with the ark stood on dry ground in the Jordan while the people crossed.'],
    ['JOS.6.19', 'Which city’s walls fell after the trumpets sounded?', 'Jericho', 'Babylon', 'At Jericho the people shouted at the sound of the trumpets, and the city wall fell.'],
    ['JDG.6.37', 'What did Gideon lay out when he asked for a sign?', 'A fleece', 'Wheat grains', 'Gideon asked for dew on the fleece while the ground around it stayed dry.'],
    ['JDG.16.17', 'What was Samson to leave uncut?', 'His hair', 'His beard', 'Samson told Delilah his hair had never been cut because he was dedicated to God.'],
    ['RUT.1.16', 'Who went to Bethlehem with Ruth?', 'Naomi', 'Esther', 'Ruth decided to stay with Naomi and go wherever she went.'],
    ['1SA.3.4', 'Whom did God call by name at night?', 'Samuel', 'Solomon', 'Young Samuel heard a voice and at first thought Eli was calling him.'],
    ['1SA.17.49', 'What did David use to throw a stone at Goliath?', 'A sling', 'A bow', 'The stone from David’s sling hit Goliath in the forehead.'],
    ['1KI.3.9', 'What did Solomon ask God for?', 'Wisdom', 'Riches', 'Solomon asked for an understanding heart so he could judge the people fairly.'],
    ['1KI.18.38', 'What came down on Elijah’s altar?', 'Fire', 'Snow', 'After Elijah prayed, fire consumed the offering and the water around it.'],
    ['2KI.5.14', 'In what river did Naaman wash?', 'The Jordan', 'The Nile', 'Following Elisha’s words, Naaman dipped in the Jordan seven times and was healed.'],
    ['JOB.1.20', 'What did Job do after hearing the bad news?', 'He worshiped God', 'He went hunting', 'In his grief, Job tore his robe and bowed down before God.'],
    ['NEH.6.15', 'What was rebuilt in Jerusalem under Nehemiah?', 'The city wall', 'A bridge over a river', 'Despite opposition, the builders finished Jerusalem’s wall in 52 days.'],
    ['EST.7.3', 'For whom did Esther plead with the king?', 'Herself and her people', 'The royal guards', 'At the banquet Esther asked that her life and the lives of her people be spared.'],
    ['DAN.3.23', 'Where were Daniel’s three friends thrown?', 'Into a fiery furnace', 'Into a deep well', 'The friends refused to bow to the statue and were thrown into a blazing furnace.'],
    ['DAN.6.16', 'With what animals was Daniel cast?', 'Lions', 'Bears', 'The king ordered Daniel thrown into the lions’ den, but God kept him alive.'],
    ['JON.2.1', 'What swallowed Jonah?', 'A big fish', 'A crocodile', 'Jonah spent three days and three nights inside the great fish.'],
    ['EZK.37.10', 'What came to life in Ezekiel’s vision?', 'Dry bones', 'Stone statues', 'In Ezekiel’s vision the bones came to life, and a great crowd stood up.'],
  ]);

  const newTestament = unpack('New Testament', [
    ['LUK.1.31', 'What name did the angel give for Mary’s son?', 'Jesus', 'John', 'The angel told Mary she would have a son and name him Jesus.'],
    ['LUK.1.13', 'Who was John the Baptist’s father?', 'Zechariah', 'Joseph', 'The angel told Zechariah that Elizabeth would bear a son to be named John.'],
    ['MAT.1.20', 'How did the angel appear to Joseph?', 'In a dream', 'On a boat', 'In the dream the angel told Joseph to take Mary as his wife and explained the child’s origin.'],
    ['LUK.2.4', 'In what town was Jesus born?', 'Bethlehem', 'Nazareth', 'Joseph and Mary came from Nazareth to Bethlehem for the census. Jesus was born there.'],
    ['LUK.2.7', 'Where did Mary lay the baby Jesus?', 'In a manger', 'In a basket', 'Mary laid Jesus in an animal feeding trough because there was no room for them at the inn.'],
    ['LUK.2.15', 'Who went to Bethlehem after the angel’s news?', 'Shepherds', 'Fishermen', 'The shepherds heard about the Savior’s birth and went to see him.'],
    ['MAT.2.2', 'What did the wise men see in the sky?', 'A star', 'A rainbow', 'The wise men saw a star and came to honor the newborn King.'],
    ['MAT.2.11', 'Which of these gifts did the wise men bring Jesus?', 'Gold', 'Silver', 'The wise men opened their treasures and offered gold, frankincense, and myrrh.'],
    ['MAT.2.13', 'Where did Joseph take his family to escape Herod?', 'Egypt', 'Rome', 'An angel warned Joseph of the danger and told him to flee to Egypt.'],
    ['LUK.2.46', 'Where was Jesus found when he was twelve?', 'In the temple', 'At the market', 'Jesus was sitting among the teachers, listening and asking questions.'],
    ['MAT.3.13', 'Who baptized Jesus in the Jordan?', 'John the Baptist', 'The apostle Peter', 'Jesus came from Galilee to John to be baptized in the Jordan.'],
    ['MAT.4.1', 'Where did Jesus go at the start of his temptation?', 'The wilderness', 'The temple', 'The Spirit led Jesus into the wilderness, where he fasted and faced temptation.'],
    ['MAT.4.18', 'What did Peter and Andrew do before Jesus called them?', 'They fished', 'They tended sheep', 'Jesus saw the brothers casting a net into the Sea of Galilee.'],
    ['JHN.2.9', 'What did Jesus turn water into at a wedding?', 'Wine', 'Oil', 'The banquet host tasted the water that had become wine.'],
    ['JHN.3.2', 'When did Nicodemus come to Jesus?', 'At night', 'At dawn', 'Nicodemus came at night and began talking with Jesus about the signs he had done.'],
    ['JHN.4.7', 'Whom did Jesus ask for a drink at the well?', 'A Samaritan woman', 'A Roman soldier', 'A request for water began Jesus’ conversation with the Samaritan woman.'],
    ['MRK.2.4', 'How did the friends lower the sick man to Jesus?', 'Through the roof', 'Through a window', 'The crowd blocked the way, so the friends lowered the mat through an opening in the roof.'],
    ['MRK.4.39', 'What did Jesus calm while in the boat?', 'A storm', 'A fire', 'Jesus told the wind and sea to be still, and it became calm.'],
    ['MRK.5.41', 'Whose hand did Jesus take before telling her to get up?', 'Jairus’s daughter', 'Peter’s sister', 'Jesus took the girl’s hand and called her to get up. She stood and walked.'],
    ['MAT.14.17', 'What did Jesus use to feed five thousand people?', 'Bread and fish', 'Bread and cheese', 'The disciples had five loaves and two fish, and there was enough for everyone.'],
    ['MAT.14.29', 'Who got out of the boat and walked on water to Jesus?', 'Peter', 'Andrew', 'At Jesus’ word, Peter stepped out of the boat and walked on the water.'],
    ['LUK.10.33', 'Who helped the injured man in Jesus’ parable?', 'A Samaritan', 'A priest', 'The Samaritan felt compassion for the injured man and took care of him.'],
    ['LUK.15.4', 'What does the shepherd look for in Jesus’ parable?', 'A lost sheep', 'A lost goat', 'The shepherd leaves ninety-nine sheep and searches until he finds the missing one.'],
    ['LUK.15.20', 'Who ran to meet the prodigal son?', 'His father', 'His older brother', 'The father saw his son from far away, ran to him, and embraced him.'],
    ['LUK.17.15', 'How many healed men returned to thank Jesus?', 'One', 'All ten', 'One of the ten men who were healed came back, praising God.'],
    ['LUK.19.4', 'What did Zacchaeus do to see Jesus?', 'Climbed a tree', 'Climbed onto a roof', 'Zacchaeus was short and climbed a tree to see Jesus above the crowd.'],
    ['JHN.11.43', 'Whom did Jesus call out of the tomb?', 'Lazarus', 'Joseph', 'Jesus called Lazarus in a loud voice, and Lazarus came out alive.'],
    ['MAT.17.2', 'What happened to Jesus’ face at the Transfiguration?', 'It shone', 'It grew dark', 'On the mountain Jesus’ face shone and his clothes became bright.'],
    ['MRK.12.42', 'What did the poor widow put into the treasury?', 'Two small coins', 'A gold ring', 'The widow gave two small coins. Jesus drew the disciples’ attention to her generosity.'],
    ['MAT.21.5', 'What did Jesus ride into Jerusalem?', 'A donkey', 'A camel', 'Jesus entered the city as a humble King riding a donkey.'],
    ['JHN.13.5', 'What did Jesus wash for his disciples at supper?', 'Their feet', 'Their hands', 'Jesus washed the disciples’ feet and gave them an example of service.'],
    ['MAT.26.26', 'What did Jesus break at the Last Supper?', 'Bread', 'Fish', 'Jesus blessed the bread, broke it, and gave it to the disciples.'],
    ['MAT.26.36', 'Where did Jesus pray before his arrest?', 'Gethsemane', 'Nazareth', 'Jesus came with the disciples to Gethsemane and went aside to pray.'],
    ['MAT.26.48', 'What sign did Judas use to identify Jesus?', 'A kiss', 'A wave', 'Judas arranged to kiss the one they were to arrest.'],
    ['MAT.26.75', 'How many times did Peter deny Jesus?', 'Three times', 'Once', 'When the rooster crowed, Peter remembered Jesus’ words and wept.'],
    ['MAT.27.33', 'What was the place of Jesus’ crucifixion called?', 'Golgotha', 'Bethany', 'The Gospel explains that Golgotha means the Place of the Skull.'],
    ['MAT.27.60', 'Where did Joseph of Arimathea lay Jesus’ body?', 'In a tomb cut in rock', 'In the temple', 'Joseph put Jesus’ body in his new tomb and rolled a stone across its entrance.'],
    ['MRK.16.6', 'What news did the women hear at the tomb?', 'Jesus had risen', 'The tomb was closed', 'At the empty tomb the women were told that Jesus had risen.'],
    ['JHN.20.16', 'Whom did the risen Jesus call by name at the tomb?', 'Mary Magdalene', 'Elizabeth', 'When Jesus called Mary by name, she recognized her teacher.'],
    ['JHN.20.27', 'Whom did Jesus invite to see his wounds after the resurrection?', 'Thomas', 'Judas Iscariot', 'Jesus invited Thomas to see his wounds, and Thomas believed.'],
    ['LUK.24.35', 'When did the disciples in Emmaus recognize Jesus?', 'When he broke the bread', 'When he opened the door', 'The two disciples told how they recognized Jesus when he broke the bread.'],
    ['ACT.1.9', 'What hid Jesus at the ascension?', 'A cloud', 'Mist over the river', 'The disciples watched Jesus go up until a cloud hid him from sight.'],
    ['ACT.2.3', 'What did the tongues at Pentecost look like?', 'Fire', 'Drops of water', 'Tongues like fire appeared over those gathered, and they were filled with the Holy Spirit.'],
    ['ACT.3.6', 'What did Peter tell the man who could not walk?', 'Get up and walk', 'Go to the river', 'At the temple gate Peter told the man to get up in Jesus’ name, and he walked.'],
    ['ACT.9.3', 'What city was Saul approaching when he saw a light?', 'Damascus', 'Bethlehem', 'On the road to Damascus a light from heaven surrounded Saul, and he heard Jesus’ voice.'],
    ['ACT.9.17', 'Who visited Saul after he lost his sight in Damascus?', 'Ananias', 'Thomas', 'The Lord sent Ananias to Saul, and Saul received his sight again.'],
    ['ACT.16.26', 'What shook the prison holding Paul and Silas?', 'An earthquake', 'Heavy rain', 'After the earthquake the prison doors opened and the prisoners’ chains came loose.'],
    ['ACT.28.3', 'What animal fastened onto Paul’s hand?', 'A snake', 'A lizard', 'When Paul put sticks on the fire, a snake came out from the heat and fastened onto his hand.'],
    ['REV.1.9', 'On which island did John receive Revelation?', 'Patmos', 'Crete', 'John says that he was on the island of Patmos when he received the vision.'],
    ['REV.21.2', 'What city did John see coming down from heaven?', 'New Jerusalem', 'New Babylon', 'In John’s vision the holy city, New Jerusalem, came down from God out of heaven.'],
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
