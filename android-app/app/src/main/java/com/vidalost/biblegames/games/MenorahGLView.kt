package com.vidalost.biblegames.games

import android.content.Context
import android.graphics.PixelFormat
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.view.MotionEvent
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Native OpenGL ES port of the procedural Three.js menorah from
 * games/sacred-word.js.  The geometry uses the same radii, heights, cups,
 * candles, camera movement, flame order and floating animation as the web app.
 * There is no WebView, captured image or flat replacement.
 */
class MenorahGLView(context: Context) : GLSurfaceView(context) {
    private val scene = MenorahRenderer()
    private var lastX = 0f
    private var lastY = 0f
    private var moved = false

    init {
        setEGLContextClientVersion(2)
        setEGLConfigChooser(8, 8, 8, 8, 24, 0)
        holder.setFormat(PixelFormat.TRANSLUCENT)
        setRenderer(scene)
        renderMode = RENDERMODE_CONTINUOUSLY
        preserveEGLContextOnPause = true
    }

    fun setErrors(errors: Int) = queueEvent { scene.setErrors(errors.coerceIn(0, 7)) }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
                moved = false
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX
                val dy = event.y - lastY
                if (kotlin.math.abs(dx) >= kotlin.math.abs(dy)) {
                    scene.userRotation += dx * .24f
                    moved = moved || kotlin.math.abs(dx) > 2f
                } else {
                    parent?.requestDisallowInterceptTouchEvent(false)
                }
                lastX = event.x
                lastY = event.y
            }
            MotionEvent.ACTION_UP -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                if (!moved) performClick()
            }
            MotionEvent.ACTION_CANCEL -> parent?.requestDisallowInterceptTouchEvent(false)
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}

private class MenorahRenderer : GLSurfaceView.Renderer {
    private var program = 0
    private var aPosition = 0
    private var aNormal = 0
    private var uModel = 0
    private var uViewProjection = 0
    private var uColor = 0
    private var uEmissive = 0
    private var uAlpha = 0
    private var uCamera = 0
    private var uMetalness = 0
    private var uRoughness = 0

    private var sphere: GlMesh? = null
    private var baseLower: GlMesh? = null
    private var baseUpper: GlMesh? = null
    private var stem: GlMesh? = null
    private var cup: GlMesh? = null
    private var candle: GlMesh? = null
    private var wick: GlMesh? = null
    private var floor: GlMesh? = null
    private val branches = mutableListOf<Pair<Float, GlMesh>>()

    private val projection = FloatArray(16)
    private val view = FloatArray(16)
    private val vp = FloatArray(16)
    private val model = FloatArray(16)
    private var startedAt = System.nanoTime()
    private var errors = 0
    private var previousErrors = 0
    private var smokeStartedAt = 0f
    private var smokeRotation = 0f
    private var smokeGroupY = -1f
    private var lastRotation = 0f
    private var lastGroupY = -1f
    var userRotation = 0f

    override fun onSurfaceCreated(
        gl: javax.microedition.khronos.opengles.GL10?,
        config: javax.microedition.khronos.egl.EGLConfig?,
    ) {
        program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
        aPosition = GLES20.glGetAttribLocation(program, "aPosition")
        aNormal = GLES20.glGetAttribLocation(program, "aNormal")
        uModel = GLES20.glGetUniformLocation(program, "uModel")
        uViewProjection = GLES20.glGetUniformLocation(program, "uViewProjection")
        uColor = GLES20.glGetUniformLocation(program, "uColor")
        uEmissive = GLES20.glGetUniformLocation(program, "uEmissive")
        uAlpha = GLES20.glGetUniformLocation(program, "uAlpha")
        uCamera = GLES20.glGetUniformLocation(program, "uCamera")
        uMetalness = GLES20.glGetUniformLocation(program, "uMetalness")
        uRoughness = GLES20.glGetUniformLocation(program, "uRoughness")

        sphere = MeshFactory.sphere(24, 16)
        baseLower = MeshFactory.frustum(topRadius = 2.5f, bottomRadius = 2.8f, height = .4f, segments = 32)
        baseUpper = MeshFactory.frustum(topRadius = 1.8f, bottomRadius = 2.2f, height = .4f, segments = 32)
        stem = MeshFactory.frustum(topRadius = .25f, bottomRadius = .35f, height = 6.5f, segments = 20)
        cup = MeshFactory.frustum(topRadius = .35f, bottomRadius = .20f, height = .4f, segments = 20)
        candle = MeshFactory.frustum(topRadius = .18f, bottomRadius = .20f, height = 1.2f, segments = 20)
        wick = MeshFactory.frustum(topRadius = .02f, bottomRadius = .02f, height = .2f, segments = 8)
        floor = MeshFactory.disc(4.6f, 64)
        branches.clear()
        listOf(1.2f, 2.4f, 3.6f).forEach { radius ->
            branches += radius to MeshFactory.halfTorus(radius, .18f, 48, 16)
        }

        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
        GLES20.glEnable(GLES20.GL_CULL_FACE)
        GLES20.glCullFace(GLES20.GL_BACK)
        GLES20.glClearColor(0f, 0f, 0f, 0f)
        startedAt = System.nanoTime()
    }

    override fun onSurfaceChanged(
        gl: javax.microedition.khronos.opengles.GL10?,
        width: Int,
        height: Int,
    ) {
        GLES20.glViewport(0, 0, width, height)
        Matrix.perspectiveM(projection, 0, 45f, width.toFloat() / max(1, height), .1f, 1000f)
    }

    override fun onDrawFrame(gl: javax.microedition.khronos.opengles.GL10?) {
        val seconds = (System.nanoTime() - startedAt) / 1_000_000_000f
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        GLES20.glUseProgram(program)

        // Same motion as Date.now() * 0.005 in the web renderer.
        val cameraX = sin(seconds * .20f) * 1.15f
        val cameraZ = 14.2f + cos(seconds * .20f) * .55f
        Matrix.setLookAtM(view, 0, cameraX, 2.35f, cameraZ, 0f, 1.35f, 0f, 0f, 1f, 0f)
        Matrix.multiplyMM(vp, 0, projection, 0, view, 0)
        GLES20.glUniformMatrix4fv(uViewProjection, 1, false, vp, 0)
        GLES20.glUniform3f(uCamera, cameraX, 2.35f, cameraZ)

        val rotation = sin(seconds * .60f) * 6.875f + userRotation
        val groupY = -1f + sin(seconds * 1.10f) * .055f
        lastRotation = rotation
        lastGroupY = groupY
        drawFloor()
        drawMenorah(rotation, groupY)
        drawFlamesAndSmoke(seconds, rotation, groupY)
    }

    fun setErrors(value: Int) {
        if (value > errors) {
            previousErrors = errors
            smokeStartedAt = (System.nanoTime() - startedAt) / 1_000_000_000f
            smokeRotation = lastRotation
            smokeGroupY = lastGroupY
        }
        errors = value
    }

    private fun drawFloor() {
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        GLES20.glDepthMask(false)
        draw(
            floor, 0f, -3.25f, 0f, 1f, 1f, 1f,
            groupRotation = 0f, groupY = 0f,
            color = floatArrayOf(1f, .89f, .52f), alpha = .14f, emissive = .22f,
            metalness = 0f, roughness = 1f,
        )
        GLES20.glDepthMask(true)
        GLES20.glDisable(GLES20.GL_BLEND)
    }

    private fun drawMenorah(rotation: Float, groupY: Float) {
        val gold = floatArrayOf(1f, .66f, .20f)
        val darkGold = floatArrayOf(.84f, .39f, .045f)
        val wax = floatArrayOf(.99f, .985f, .965f)
        val wickColor = floatArrayOf(.055f, .045f, .035f)

        draw(baseLower, 0f, -3f, 0f, groupRotation = rotation, groupY = groupY, color = darkGold)
        draw(baseUpper, 0f, -2.6f, 0f, groupRotation = rotation, groupY = groupY, color = gold)
        draw(stem, 0f, 0f, 0f, groupRotation = rotation, groupY = groupY, color = gold)

        listOf(-1.5f, 0f, 1.5f).forEach { y ->
            draw(sphere, 0f, y, 0f, .45f, .36f, .45f, groupRotation = rotation, groupY = groupY, color = gold)
        }

        branches.forEach { (radius, mesh) ->
            draw(mesh, 0f, 2f, 0f, groupRotation = rotation, groupY = groupY, color = gold)
            draw(sphere, 0f, 2f - radius, 0f, .30f, .30f, .30f, groupRotation = rotation, groupY = groupY, color = gold)
        }

        flameXs.forEach { x ->
            draw(cup, x, 2.2f, 0f, groupRotation = rotation, groupY = groupY, color = darkGold)
            draw(sphere, x, 2f, 0f, .25f, .25f, .25f, groupRotation = rotation, groupY = groupY, color = gold)
            draw(candle, x, 2.8f, 0f, groupRotation = rotation, groupY = groupY, color = wax, metalness = 0f, roughness = .9f)
            draw(wick, x, 3.45f, 0f, groupRotation = rotation, groupY = groupY, color = wickColor, metalness = 0f, roughness = .9f)
        }
    }

    private fun drawFlamesAndSmoke(t: Float, rotation: Float, groupY: Float) {
        val activeIndices = flameOrder.drop(errors.coerceIn(0, 7)).toSet()
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE)
        GLES20.glDepthMask(false)

        flameXs.forEachIndexed { index, x ->
            if (index !in activeIndices) return@forEachIndexed
            val offset = index * 13.73f
            val flicker = .9f + sin(t * 2.25f + offset) * .06f + sin(t * 14f + offset) * .13f
            val driftX = sin(t * 5.5f + offset) * .018f
            val driftY = sin(t * 11f + offset) * .045f
            draw(
                sphere, x + driftX, 3.70f + driftY, 0f,
                .68f * flicker, 1.03f * flicker, .36f * flicker,
                groupRotation = rotation, groupY = groupY,
                color = floatArrayOf(1f, .22f, .015f), alpha = .24f, emissive = 1f,
                metalness = 0f, roughness = 1f,
            )
            draw(
                sphere, x + driftX, 3.66f + driftY, .015f,
                .27f * flicker, .49f * flicker, .20f * flicker,
                groupRotation = rotation, groupY = groupY,
                color = floatArrayOf(1f, .90f, .35f), alpha = .94f, emissive = 1f,
                metalness = 0f, roughness = 1f,
            )
        }

        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        val smokeAge = t - smokeStartedAt
        if (smokeStartedAt > 0f && smokeAge in 0f..4.2f) {
            val radians = Math.toRadians(smokeRotation.toDouble())
            val cosR = cos(radians).toFloat()
            val sinR = sin(radians).toFloat()
            flameOrder.take(errors).drop(previousErrors).forEachIndexed { cloud, flameIndex ->
                repeat(8) { particle ->
                    val age = (smokeAge - particle * .12f).coerceAtLeast(0f)
                    val alpha = ((1f - age / 3.5f) * .28f).coerceAtLeast(0f)
                    val localX = flameXs[flameIndex] + sin(age * 2.4f + particle + cloud) * (.05f + age * .055f)
                    val worldX = localX * cosR
                    val worldZ = -localX * sinR
                    val worldY = smokeGroupY + 3.7f + age * .39f + particle * .025f
                    draw(
                        sphere, worldX, worldY, worldZ,
                        .08f + age * .055f, .13f + age * .075f, .08f + age * .055f,
                        groupRotation = 0f, groupY = 0f,
                        color = floatArrayOf(.62f, .68f, .76f), alpha = alpha,
                        metalness = 0f, roughness = 1f,
                    )
                }
            }
        }
        GLES20.glDepthMask(true)
        GLES20.glDisable(GLES20.GL_BLEND)
    }

    private fun draw(
        mesh: GlMesh?,
        x: Float,
        y: Float,
        z: Float,
        sx: Float = 1f,
        sy: Float = 1f,
        sz: Float = 1f,
        rx: Float = 0f,
        ry: Float = 0f,
        rz: Float = 0f,
        groupRotation: Float,
        groupY: Float,
        color: FloatArray,
        alpha: Float = 1f,
        emissive: Float = .16f,
        metalness: Float = .96f,
        roughness: Float = .18f,
    ) {
        mesh ?: return
        Matrix.setIdentityM(model, 0)
        Matrix.translateM(model, 0, 0f, groupY, 0f)
        Matrix.rotateM(model, 0, groupRotation, 0f, 1f, 0f)
        Matrix.translateM(model, 0, x, y, z)
        Matrix.rotateM(model, 0, rx, 1f, 0f, 0f)
        Matrix.rotateM(model, 0, ry, 0f, 1f, 0f)
        Matrix.rotateM(model, 0, rz, 0f, 0f, 1f)
        Matrix.scaleM(model, 0, sx, sy, sz)
        GLES20.glUniformMatrix4fv(uModel, 1, false, model, 0)
        GLES20.glUniform3f(uColor, color[0], color[1], color[2])
        GLES20.glUniform1f(uEmissive, emissive)
        GLES20.glUniform1f(uAlpha, alpha)
        GLES20.glUniform1f(uMetalness, metalness)
        GLES20.glUniform1f(uRoughness, roughness)
        mesh.draw(aPosition, aNormal)
    }

    companion object {
        private val flameXs = listOf(-3.6f, -2.4f, -1.2f, 0f, 1.2f, 2.4f, 3.6f)
        private val flameOrder = listOf(0, 6, 1, 5, 2, 4, 3)

        private const val VERTEX_SHADER = """
            uniform mat4 uModel;
            uniform mat4 uViewProjection;
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                vec4 world = uModel * vec4(aPosition, 1.0);
                vWorld = world.xyz;
                vNormal = normalize(mat3(uModel) * aNormal);
                gl_Position = uViewProjection * world;
            }
        """

        private const val FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec3 uColor;
            uniform vec3 uCamera;
            uniform float uEmissive;
            uniform float uAlpha;
            uniform float uMetalness;
            uniform float uRoughness;
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                vec3 n = normalize(vNormal);
                vec3 key = normalize(vec3(0.50, 1.00, 0.80));
                vec3 back = normalize(vec3(-0.55, 0.55, -0.90));
                vec3 viewDir = normalize(uCamera - vWorld);
                float keyDiffuse = max(dot(n, key), 0.0);
                float backDiffuse = max(dot(n, back), 0.0);
                float diffuse = 0.58 * keyDiffuse + 0.34 * backDiffuse;
                vec3 halfDir = normalize(key + viewDir);
                float power = mix(22.0, 96.0, 1.0 - uRoughness);
                float spec = pow(max(dot(n, halfDir), 0.0), power) * mix(0.28, 1.55, uMetalness);
                float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * mix(0.08, 0.48, uMetalness);
                vec3 lit = uColor * (0.34 + diffuse + uEmissive) + vec3(spec + fresnel);
                lit = lit / (lit + vec3(0.72));
                gl_FragColor = vec4(lit, uAlpha);
            }
        """

        private fun createProgram(vertex: String, fragment: String): Int {
            fun compile(type: Int, source: String): Int = GLES20.glCreateShader(type).also {
                GLES20.glShaderSource(it, source)
                GLES20.glCompileShader(it)
            }
            return GLES20.glCreateProgram().also { result ->
                GLES20.glAttachShader(result, compile(GLES20.GL_VERTEX_SHADER, vertex))
                GLES20.glAttachShader(result, compile(GLES20.GL_FRAGMENT_SHADER, fragment))
                GLES20.glLinkProgram(result)
            }
        }
    }
}

private class GlMesh(data: FloatArray) {
    private val buffer: FloatBuffer = ByteBuffer.allocateDirect(data.size * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
        .apply { put(data); position(0) }
    private val count = data.size / 6

    fun draw(position: Int, normal: Int) {
        buffer.position(0)
        GLES20.glVertexAttribPointer(position, 3, GLES20.GL_FLOAT, false, 24, buffer)
        GLES20.glEnableVertexAttribArray(position)
        buffer.position(3)
        GLES20.glVertexAttribPointer(normal, 3, GLES20.GL_FLOAT, false, 24, buffer)
        GLES20.glEnableVertexAttribArray(normal)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, count)
    }
}

private object MeshFactory {
    fun frustum(topRadius: Float, bottomRadius: Float, height: Float, segments: Int): GlMesh {
        val out = mutableListOf<Float>()
        val half = height / 2f
        val normalY = (bottomRadius - topRadius) / height
        fun vertex(x: Float, y: Float, z: Float, nx: Float, ny: Float, nz: Float) {
            val length = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(.0001f)
            out += listOf(x, y, z, nx / length, ny / length, nz / length)
        }
        repeat(segments) { index ->
            val a = 2.0 * PI * index / segments
            val b = 2.0 * PI * (index + 1) / segments
            val ca = cos(a).toFloat(); val sa = sin(a).toFloat()
            val cb = cos(b).toFloat(); val sb = sin(b).toFloat()
            val b0 = floatArrayOf(ca * bottomRadius, -half, sa * bottomRadius)
            val b1 = floatArrayOf(cb * bottomRadius, -half, sb * bottomRadius)
            val t0 = floatArrayOf(ca * topRadius, half, sa * topRadius)
            val t1 = floatArrayOf(cb * topRadius, half, sb * topRadius)
            fun side(p: FloatArray, c: Float, s: Float) = vertex(p[0], p[1], p[2], c, normalY, s)
            side(b0, ca, sa); side(t1, cb, sb); side(b1, cb, sb)
            side(b0, ca, sa); side(t0, ca, sa); side(t1, cb, sb)
            vertex(0f, half, 0f, 0f, 1f, 0f); vertex(t1[0], half, t1[2], 0f, 1f, 0f); vertex(t0[0], half, t0[2], 0f, 1f, 0f)
            vertex(0f, -half, 0f, 0f, -1f, 0f); vertex(b0[0], -half, b0[2], 0f, -1f, 0f); vertex(b1[0], -half, b1[2], 0f, -1f, 0f)
        }
        return GlMesh(out.toFloatArray())
    }

    fun sphere(longitude: Int, latitude: Int): GlMesh {
        val out = mutableListOf<Float>()
        fun point(lat: Int, lon: Int): FloatArray {
            val phi = -PI / 2 + PI * lat / latitude
            val theta = 2 * PI * lon / longitude
            val x = (cos(phi) * cos(theta)).toFloat()
            val y = sin(phi).toFloat()
            val z = (cos(phi) * sin(theta)).toFloat()
            return floatArrayOf(x, y, z, x, y, z)
        }
        fun add(point: FloatArray) { point.forEach(out::add) }
        repeat(latitude) { lat ->
            repeat(longitude) { lon ->
                val a = point(lat, lon)
                val b = point(lat + 1, lon)
                val c = point(lat + 1, lon + 1)
                val d = point(lat, lon + 1)
                add(a); add(b); add(c)
                add(a); add(c); add(d)
            }
        }
        return GlMesh(out.toFloatArray())
    }

    /** Half torus rotated by PI around Z, exactly matching Three.js. */
    fun halfTorus(majorRadius: Float, tubeRadius: Float, majorSegments: Int, tubeSegments: Int): GlMesh {
        val out = mutableListOf<Float>()
        fun point(uIndex: Int, vIndex: Int): FloatArray {
            val u = PI * uIndex / majorSegments
            val v = 2 * PI * vIndex / tubeSegments
            val radialX = -cos(u).toFloat()
            val radialY = -sin(u).toFloat()
            val cv = cos(v).toFloat()
            val sv = sin(v).toFloat()
            val nx = radialX * cv
            val ny = radialY * cv
            val nz = sv
            return floatArrayOf(
                radialX * majorRadius + nx * tubeRadius,
                radialY * majorRadius + ny * tubeRadius,
                nz * tubeRadius,
                nx, ny, nz,
            )
        }
        fun add(point: FloatArray) { point.forEach(out::add) }
        repeat(majorSegments) { u ->
            repeat(tubeSegments) { v ->
                val a = point(u, v)
                val b = point(u + 1, v)
                val c = point(u + 1, v + 1)
                val d = point(u, v + 1)
                add(a); add(b); add(c)
                add(a); add(c); add(d)
            }
        }
        return GlMesh(out.toFloatArray())
    }

    fun disc(radius: Float, segments: Int): GlMesh {
        val out = mutableListOf<Float>()
        fun vertex(x: Float, y: Float, z: Float) { out += listOf(x, y, z, 0f, 1f, 0f) }
        repeat(segments) { index ->
            val a = 2 * PI * index / segments
            val b = 2 * PI * (index + 1) / segments
            vertex(0f, 0f, 0f)
            vertex(cos(b).toFloat() * radius, 0f, sin(b).toFloat() * radius)
            vertex(cos(a).toFloat() * radius, 0f, sin(a).toFloat() * radius)
        }
        return GlMesh(out.toFloatArray())
    }
}
