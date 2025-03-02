<template>
  <v-app id="app">
    <v-app-bar app :absolute="!$store.state.fullscreen" :inverted-scroll="$store.state.fullscreen">
      <v-app-bar-nav-icon @click="drawer = true" />
      <v-img :src="require('@/assets/logo.svg')" max-width="32" max-height="32" contain style="margin-right: 8px" />
      <v-toolbar-title>
        <router-link class="link-invis" style="margin-right: 10px" to="/">
          OpenTogetherTube
        </router-link>
      </v-toolbar-title>
      <v-toolbar-items v-if="$vuetify.breakpoint.lgAndUp">
        <v-btn text to="/rooms">Browse</v-btn>
        <v-btn text to="/faq">FAQ</v-btn>
      </v-toolbar-items>
      <v-spacer />
      <v-toolbar-items v-if="$vuetify.breakpoint.lgAndUp">
        <v-menu offset-y>
          <template v-slot:activator="{ on }">
            <v-btn text v-on="on">
              <v-icon class="side-pad">fas fa-plus-square</v-icon>Create Room
            </v-btn>
          </template>
          <v-list two-line max-width="400">
            <NavCreateRoom @createtemp="createTempRoom" @createperm="showCreateRoomForm = true" />
          </v-list>
        </v-menu>
        <NavUser @login="showLogin = true" @logout="logout" />
      </v-toolbar-items>
    </v-app-bar>
    <v-navigation-drawer v-model="drawer" absolute temporary>
      <v-list nav dense>
        <v-list-item-group>
          <v-list-item to="/">
            <v-list-item-content>
              Home
            </v-list-item-content>
          </v-list-item>
          <v-list-item to="/rooms">
            <v-list-item-content>
              Browse
            </v-list-item-content>
          </v-list-item>
          <v-list-item to="/faq">
            <v-list-item-content>
              FAQ
            </v-list-item-content>
          </v-list-item>
          <NavCreateRoom @createtemp="createTempRoom" @createperm="showCreateRoomForm = true" />
          <NavUser @login="showLogin = true" @logout="logout" />
        </v-list-item-group>
      </v-list>
      <template v-slot:append>
        <div class="pa-2">
          <NavUser @login="showLogin = true" @logout="logout" />
        </div>
      </template>
    </v-navigation-drawer>
    <v-content>
      <router-view/>
    </v-content>
    <v-container>
      <v-dialog v-model="showCreateRoomForm" persistent max-width="600">
        <CreateRoomForm @roomCreated="showCreateRoomForm = false" @cancel="showCreateRoomForm = false" />
      </v-dialog>
    </v-container>
    <v-container>
      <v-dialog v-model="showLogin" max-width="600">
        <LogInForm @shouldClose="showLogin = false" />
      </v-dialog>
    </v-container>
    <v-overlay :value="isLoadingCreateRoom">
      <v-container fill-height>
        <v-row align="center" justify="center">
          <v-col cols="12" sm="4">
            <v-progress-circular indeterminate />
            <v-btn elevation="12" x-large @click="cancelRoom" style="margin-top: 24px">Cancel</v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-overlay>
    <Notifier />
  </v-app>
</template>

<script lang="ts">
import Vue from "vue";
import { API } from "@/common-http.js";
import CreateRoomForm from "@/components/CreateRoomForm.vue";
import LogInForm from "@/components/LogInForm.vue";
import RoomUtilsMixin from "@/mixins/RoomUtils.js";
import NavUser from "@/components/navbar/NavUser.vue";
import NavCreateRoom from "@/components/navbar/NavCreateRoom.vue";
import Notifier from "@/components/Notifier.vue";

export default Vue.extend({
  name: "app",
  components: {
    CreateRoomForm,
    LogInForm,
    NavUser,
    NavCreateRoom,
    Notifier,
  },
  mixins: [RoomUtilsMixin],
  data() {
    return {
      showCreateRoomForm: false,
      showLogin: false,
      drawer: false,
    };
  },
  methods: {
    logout() {
      API.post("/user/logout").then(res => {
        if (res.data.success) {
          this.$store.commit("LOGOUT");
        }
      });
    },
  },
  async created() {
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this.$store.state.fullscreen = true;
        document.querySelector("html").classList.add("scrollbarBeGone");
      }
      else {
        this.$store.state.fullscreen = false;
        document.querySelector("html").classList.remove("scrollbarBeGone");
      }
    });

    await this.$store.dispatch("getNewToken");

    // ask the server if we are logged in or not, and update the client to reflect that status.
    await API.get("/user").then(res => {
      if (res.data.loggedIn) {
        let user = res.data;
        delete user.loggedIn;
        this.$store.commit("LOGIN", user);
      }
    });
  },
});
</script>

<style lang="scss">
@import "variables.scss";

.link-invis {
  text-decoration: none;
  color: inherit !important;
}

.side-pad {
  margin: 0 4px;
}

.vue-slider-process {
  background: $brand-color !important;
}

.text-muted {
  opacity: 0.7;
}

.scrollbarBeGone {
  -ms-overflow-style: none; // I think this is an old way to do this? Probably not ideal
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
</style>
