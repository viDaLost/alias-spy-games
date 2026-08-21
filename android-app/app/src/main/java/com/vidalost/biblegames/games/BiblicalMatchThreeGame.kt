package com.vidalost.biblegames.games

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.ui.AssetImage
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max

private const val BMT_SIZE = 8
private const val BMT_PREFS = "biblical_match_three_progress_v1"
private enum class NativeSpecial(val asset:String) {
    LINE("assets/biblical-match-three/icons-v17/staff.webp"),
    BURST("assets/biblical-match-three/icons-v17/jericho.webp"),
    RAINBOW("assets/biblical-match-three/icons-v17/covenant.webp")
}
private enum class NativeSymbol(val asset:String,val color:Color){
    BIBLE("assets/biblical-match-three/icons-v17/bible.webp",Color(0xFF315F91)),
    FISH("assets/biblical-match-three/icons-v17/fish.webp",Color(0xFF2D8AA8)),
    DOVE("assets/biblical-match-three/icons-v17/dove.webp",Color(0xFF7C8DA6)),
    LAMP("assets/biblical-match-three/icons-v17/candle.webp",Color(0xFFD39B39)),
    CROWN("assets/biblical-match-three/icons-v17/crown.webp",Color(0xFFB7791F)),
    ARK("assets/biblical-match-three/icons-v17/ark.webp",Color(0xFF8B5E3C)),
    BREAD("assets/biblical-match-three/icons-v17/bread.webp",Color(0xFFC78B45)),
    GRAPES("assets/biblical-match-three/icons-v17/grapes.webp",Color(0xFF7553AA)),
    TABLETS("assets/biblical-match-three/icons-v17/tablets.webp",Color(0xFF64748B))
}
private data class NativeCell(val symbol:NativeSymbol,val special:NativeSpecial?=null)
private data class NativeLevel(val id:Int,val title:String,val moves:Int,val target:Int,val symbols:Int,val goal:NativeSymbol,val amount:Int)
private enum class NativeDifficulty(val label:String,val moves:Int,val target:Int,val symbols:Int){
    EASY("Лёгкий",30,2600,6),MEDIUM("Средний",24,4200,8),HARD("Тяжёлый",19,6200,9)
}
private val nativeLevels=listOf(
    NativeLevel(1,"Первый свет",24,1200,6,NativeSymbol.BIBLE,8),NativeLevel(2,"Голубь мира",24,1600,6,NativeSymbol.DOVE,10),
    NativeLevel(3,"Хлеб жизни",23,2100,6,NativeSymbol.BREAD,12),NativeLevel(4,"Светильник",22,2600,7,NativeSymbol.LAMP,12),
    NativeLevel(5,"Добрый плод",22,3200,7,NativeSymbol.GRAPES,14),NativeLevel(6,"Путь ковчега",21,3800,7,NativeSymbol.ARK,12),
    NativeLevel(7,"Скрижали",21,4500,8,NativeSymbol.TABLETS,14),NativeLevel(8,"Царский венец",20,5200,8,NativeSymbol.CROWN,14),
    NativeLevel(9,"Изобилие",20,6000,9,NativeSymbol.BREAD,12),NativeLevel(10,"Большой каскад",19,7200,9,NativeSymbol.BIBLE,10)
)

@Composable fun BiblicalMatchThreeGame(assets:AssetRepository,onBack:()->Unit){
    var level by rememberSaveable{mutableStateOf<Int?>(null)}
    var free by rememberSaveable{mutableStateOf<NativeDifficulty?>(null)}
    when{level!=null->NativeBoard(assets,nativeLevels[level!!-1],null,{level=null},onBack);free!=null->NativeBoard(assets,null,free,{free=null},onBack);else->NativeMenu({level=it.id},{free=it},onBack)}
}

@Composable private fun NativeMenu(onLevel:(NativeLevel)->Unit,onFree:(NativeDifficulty)->Unit,onBack:()->Unit){
    val context=LocalContext.current
    val unlocked=context.getSharedPreferences(BMT_PREFS,Context.MODE_PRIVATE).getInt("unlocked",1)
    GameScaffold("Библейские сокровища","10 нативных уровней и свободная игра",onBack){
        GlassCard(Modifier.fillMaxWidth(),padding=14.dp){Text("Собирайте библейские символы",color=Ink,fontWeight=FontWeight.Black,fontSize=20.sp);Text("Меняйте соседние фишки, запускайте каскады и выполняйте цели.",color=InkSoft,fontSize=13.sp)}
        Spacer(Modifier.height(10.dp))
        nativeLevels.forEach{l->SecondaryButton("${l.id}. ${l.title} · ${l.moves} ходов",{onLevel(l)},Modifier.fillMaxWidth().padding(bottom=6.dp),enabled=l.id<=unlocked,accent=if(l.id<unlocked) Success else Indigo)}
        Spacer(Modifier.height(9.dp));Text("Свободная игра",Modifier.fillMaxWidth(),color=Ink,fontWeight=FontWeight.Black,fontSize=19.sp);Spacer(Modifier.height(7.dp))
        NativeDifficulty.entries.forEach{d->PrimaryButton("${d.label} · ${d.moves} ходов",{onFree(d)},Modifier.fillMaxWidth().padding(bottom=7.dp))}
    }
}

@Composable private fun NativeBoard(assets:AssetRepository,level:NativeLevel?,difficulty:NativeDifficulty?,onBack:()->Unit,onExit:()->Unit){
    val context=LocalContext.current;val scope=rememberCoroutineScope();val count=level?.symbols?:difficulty!!.symbols;val startMoves=level?.moves?:difficulty!!.moves;val target=level?.target?:difficulty!!.target
    var board by remember(level?.id,difficulty){mutableStateOf(playableBoard(count))};var selected by remember{mutableStateOf<Int?>(null)};var moves by remember{mutableIntStateOf(startMoves)};var score by remember{mutableIntStateOf(0)};var collected by remember{mutableIntStateOf(0)};var busy by remember{mutableStateOf(false)};var result by remember{mutableStateOf<Boolean?>(null)};var hint by remember{mutableStateOf<Pair<Int,Int>?>(null)}
    fun done()=score>=target&&(level==null||collected>=level.amount)
    fun reset(){board=playableBoard(count);selected=null;moves=startMoves;score=0;collected=0;busy=false;result=null;hint=null}
    fun finish(){if(done()){result=true;if(level!=null){val p=context.getSharedPreferences(BMT_PREFS,Context.MODE_PRIVATE);p.edit().putInt("unlocked",max(p.getInt("unlocked",1),level.id+1)).apply()}}else if(moves<=0) result=false}
    fun swap(a:Int,b:Int){if(busy||result!=null||moves<=0||!adjacent(a,b))return;val next=board.toMutableList();val t=next[a];next[a]=next[b];next[b]=t;var matched=matches(next);if(matched.isEmpty()){selected=null;return};moves--;busy=true;selected=null;hint=null;scope.launch{var work=next.toList();var chain=1;while(matched.isNotEmpty()){val special=makeSpecial(work,matched,a,b);val clear=expandSpecials(work,matched.toMutableSet());if(special!=null)clear.remove(special.first);if(level!=null)collected+=clear.count{work[it].symbol==level.goal};score+=clear.size*45*chain;delay(100);work=collapse(work,clear,count);if(special!=null){val m=work.toMutableList();m[special.first.coerceIn(0,m.lastIndex)]=m[special.first.coerceIn(0,m.lastIndex)].copy(special=special.second);work=m};board=work;delay(90);matched=matches(work);chain++};if(findHint(board)==null)board=playableBoard(count);busy=false;finish()}}
    GameScaffold("Библейские сокровища",level?.let{"Уровень ${it.id} · ${it.title}"}?:"Свободно · ${difficulty!!.label}",onBack,scroll=false){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){StatusPill("$moves ходов",Modifier.weight(1f),Indigo);StatusPill("$score / $target",Modifier.weight(1f),Color(0xFFB7791F));if(level!=null)StatusPill("$collected/${level.amount}",Modifier.weight(1f),level.goal.color)}
        Spacer(Modifier.height(8.dp));Box(Modifier.fillMaxWidth().weight(1f)){AssetImage(assets,"assets/biblical-match-three/board-background-v35.webp",Modifier.fillMaxSize(),ContentScale.Crop);LazyVerticalGrid(columns=GridCells.Fixed(BMT_SIZE),modifier=Modifier.fillMaxSize().padding(4.dp),horizontalArrangement=Arrangement.spacedBy(3.dp),verticalArrangement=Arrangement.spacedBy(3.dp),userScrollEnabled=false){items(board.indices.toList()){i->NativeTile(assets,board[i],selected==i,hint?.let{i==it.first||i==it.second}==true,!busy&&result==null){val s=selected;when{s==null->selected=i;s==i->selected=null;adjacent(s,i)->swap(s,i);else->selected=i}}}}}
        Spacer(Modifier.height(7.dp));Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)){SecondaryButton("Подсказка",{hint=findHint(board)},Modifier.weight(1f),enabled=!busy&&result==null);SecondaryButton("Перемешать",{board=playableBoard(count);selected=null;hint=null},Modifier.weight(1f),enabled=!busy&&result==null)}
        result?.let{ok->Spacer(Modifier.height(8.dp));GlassCard(Modifier.fillMaxWidth(),padding=13.dp){Text(if(ok)"Цель выполнена!" else "Ходы закончились",Modifier.fillMaxWidth(),textAlign=TextAlign.Center,color=if(ok) Success else Color(0xFF9A3412),fontWeight=FontWeight.Black,fontSize=19.sp);Spacer(Modifier.height(7.dp));Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)){SecondaryButton("Заново",::reset,Modifier.weight(1f));PrimaryButton(if(level!=null)"К уровням" else "К режимам",onBack,Modifier.weight(1f))}}}
    }
}

@Composable private fun NativeTile(assets:AssetRepository,cell:NativeCell,selected:Boolean,hinted:Boolean,enabled:Boolean,onClick:()->Unit){
    Surface(Modifier.aspectRatio(1f).bounceClick(enabled,onClick),RoundedCornerShape(12.dp),color=if(selected) Color(0xFFFFF4CC) else Color.White,shadowElevation=if(selected)7.dp else 2.dp,border=androidx.compose.foundation.BorderStroke(if(selected||hinted)2.dp else 1.dp,if(selected||hinted) Indigo else Color(0xFFE2E8F0))){Box(Modifier.fillMaxSize().padding(3.dp).background(cell.symbol.color.copy(.10f),RoundedCornerShape(9.dp)),contentAlignment=Alignment.Center){AssetImage(assets,cell.special?.asset?:cell.symbol.asset,Modifier.fillMaxSize().padding(2.dp))}}
}

private fun adjacent(a:Int,b:Int)=abs(a/BMT_SIZE-b/BMT_SIZE)+abs(a%BMT_SIZE-b%BMT_SIZE)==1
private fun matches(board:List<NativeCell>):Set<Int>{val out=mutableSetOf<Int>();for(r in 0 until BMT_SIZE){var c=0;while(c<BMT_SIZE){val s=board[r*BMT_SIZE+c].symbol;var e=c+1;while(e<BMT_SIZE&&board[r*BMT_SIZE+e].symbol==s)e++;if(e-c>=3)for(x in c until e)out+=r*BMT_SIZE+x;c=e}};for(c in 0 until BMT_SIZE){var r=0;while(r<BMT_SIZE){val s=board[r*BMT_SIZE+c].symbol;var e=r+1;while(e<BMT_SIZE&&board[e*BMT_SIZE+c].symbol==s)e++;if(e-r>=3)for(x in r until e)out+=x*BMT_SIZE+c;r=e}};return out}
private fun findHint(board:List<NativeCell>):Pair<Int,Int>?{for(i in board.indices){for(j in listOf(i+1,i+BMT_SIZE)){if(j>=board.size||!adjacent(i,j))continue;val m=board.toMutableList();val t=m[i];m[i]=m[j];m[j]=t;if(matches(m).isNotEmpty())return i to j}};return null}
private fun playableBoard(count:Int):List<NativeCell>{val symbols=NativeSymbol.entries.take(count);repeat(200){val b=MutableList(64){NativeCell(symbols.random())};for(i in b.indices){var n=0;while(n++<20&&matches(b).contains(i))b[i]=NativeCell(symbols.random())};if(matches(b).isEmpty()&&findHint(b)!=null)return b};return MutableList(64){NativeCell(symbols.random())}}
private fun makeSpecial(board:List<NativeCell>,matched:Set<Int>,a:Int,b:Int):Pair<Int,NativeSpecial>?{if(matched.size<4)return null;val anchor=when{b in matched->b;a in matched->a;else->matched.first()};val rows=matched.map{it/BMT_SIZE}.toSet();val cols=matched.map{it%BMT_SIZE}.toSet();return anchor to when{matched.size>=5&&rows.size>1&&cols.size>1->NativeSpecial.BURST;matched.size>=5->NativeSpecial.RAINBOW;else->NativeSpecial.LINE}}
private fun expandSpecials(board:List<NativeCell>,start:MutableSet<Int>):MutableSet<Int>{val q=start.toMutableList();while(q.isNotEmpty()){val i=q.removeAt(0);when(board[i].special){NativeSpecial.LINE->{val r=i/BMT_SIZE;val c=i%BMT_SIZE;(0 until BMT_SIZE).forEach{x->start+=r*BMT_SIZE+x;start+=x*BMT_SIZE+c}};NativeSpecial.BURST->{val r=i/BMT_SIZE;val c=i%BMT_SIZE;for(y in r-1..r+1)for(x in c-1..c+1)if(y in 0 until 8&&x in 0 until 8)start+=y*8+x};NativeSpecial.RAINBOW->{val s=board[i].symbol;board.indices.filter{board[it].symbol==s}.forEach{start+=it}};null->{}}};return start}
private fun collapse(board:List<NativeCell>,clear:Set<Int>,count:Int):List<NativeCell>{val symbols=NativeSymbol.entries.take(count);val out=MutableList(64){NativeCell(symbols.random())};for(c in 0 until 8){val keep=(7 downTo 0).map{it*8+c}.filterNot{it in clear}.map{board[it]};var k=0;for(r in 7 downTo 0)out[r*8+c]=if(k<keep.size)keep[k++] else NativeCell(symbols.random())};return out}
